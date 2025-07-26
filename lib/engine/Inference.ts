import { useAppModeState } from '@lib/state/AppMode'
import { Chats, useInference } from '@lib/state/Chat'
import BackgroundService from 'react-native-background-actions'

import { AppSettings } from '@lib/constants/GlobalValues'
import { Instructs } from '@lib/state/Instructs'
import { SamplersManager } from '@lib/state/SamplerState'
import { useTTSState } from '@lib/state/TTS'
import { mmkvSync as mmkv } from '@lib/storage/MMKV'
import { useCallback } from 'react'
import { Characters } from '../state/Characters'
import { Logger } from '../state/Logger'
import { APIBuilderParams, buildAndSendRequest } from './API/APIBuilder'
import { APIConfiguration, APIValues } from './API/APIBuilder.types'
import { APIState } from './API/APIManagerState'
import { localInference } from './LocalInference'
import { Tokenizer } from './Tokenizer'
import { Llama } from './Local/LlamaLocal'
import { RescueAPIService, RescueAPISettings, initializeRescueAPISettings } from '@lib/services/RescueAPI'

// Initialize Rescue API settings
initializeRescueAPISettings()

export const regenerateResponse = async (swipeId: number, regenCache: boolean = true) => {
    const charName = Characters.useCharacterCard.getState().card?.name
    const messagesLength = Chats.useChatState.getState()?.data?.messages?.length ?? -1
    const message = Chats.useChatState.getState()?.data?.messages?.[messagesLength - 1]

    Logger.info('Regenerate Response' + (regenCache ? '' : ' , Resetting Message'))

    if (message?.is_user) {
        await Chats.useChatState.getState().addEntry(charName ?? '', true, '')
    } else if (messagesLength && messagesLength !== 1) {
        let replacement = ''

        if (regenCache) replacement = message?.swipes[message.swipe_id].regen_cache ?? ''
        else Chats.useChatState.getState().resetRegenCache()

        if (replacement) Chats.useChatState.getState().setBuffer({ data: replacement })
        await Chats.useChatState.getState().updateEntry(messagesLength - 1, replacement, {
            updateFinished: true,
            updateStarted: true,
            resetTimings: true,
        })
    }
    await generateResponse(swipeId)
}

export const continueResponse = async (swipeId: number) => {
    Logger.info(`Continuing Response`)
    Chats.useChatState.getState().setRegenCache()
    Chats.useChatState.getState().insertLastToBuffer()
    await generateResponse(swipeId)
}

// Helper function to handle rescue API reporting
const handleRescueAPIReporting = async (generatedText: string, isGrammarEnabled: boolean) => {
    if (!isGrammarEnabled || !mmkv.getBoolean(RescueAPISettings.Enabled)) {
        return
    }

    try {
        const rescueAPI = RescueAPIService.getInstance()
        await rescueAPI.initialize()

        // Parse the AI response
        const victimData = rescueAPI.parseAIResponse(generatedText)
        
        if (victimData && rescueAPI.validateVictimData(victimData)) {
            Logger.info('Valid victim data detected, sending to Rescue API')
            
            // Check if we have an existing victim to update
            const lastVictimNumber = mmkv.getString(RescueAPISettings.LastVictimNumber)
            
            // Always update if we have a victim number stored, unless explicitly told to create new
            if (lastVictimNumber && victimData.create_new !== true) {
                Logger.info(`Updating existing victim: ${lastVictimNumber}`)
                
                // Add timestamp for update
                if (victimData.victim_info) {
                    victimData.victim_info.last_updated = new Date().toISOString()
                }
                
                // Update existing victim
                const result = await rescueAPI.updateVictim(lastVictimNumber, victimData)
                if (result && result !== 'Invalid victim number format') {
                    Logger.infoToast(`Victim ${lastVictimNumber} updated successfully`)
                } else {
                    Logger.error(`Failed to update victim ${lastVictimNumber}: ${result}`)
                    // If update fails, try creating new
                    const victimNumber = await rescueAPI.postVictim(victimData)
                    if (victimNumber) {
                        mmkv.set(RescueAPISettings.LastVictimNumber, victimNumber)
                        Logger.infoToast(`New victim reported: ${victimNumber}`)
                    }
                }
            } else {
                // Create new victim report
                Logger.info('Creating new victim report')
                
                // Add timestamp for creation
                if (victimData.victim_info) {
                    victimData.victim_info.timestamp = new Date().toISOString()
                    victimData.victim_info.last_updated = new Date().toISOString()
                }
                
                const victimNumber = await rescueAPI.postVictim(victimData)
                if (victimNumber) {
                    mmkv.set(RescueAPISettings.LastVictimNumber, victimNumber)
                    Logger.infoToast(`New victim reported: ${victimNumber}`)
                }
            }
        } else {
            Logger.debug('No valid victim data found in AI response')
        }
    } catch (error) {
        Logger.error(`Failed to send data to Rescue API: ${error}`)
    }
}

// Add new dual-generation function
export const generateResponseWithDualGeneration = async (swipeId: number) => {
    if (useInference.getState().nowGenerating) {
        Logger.infoToast('Generation already in progress')
        return
    }
    
    Chats.useChatState.getState().startGenerating(swipeId)
    Logger.info(`Starting dual-generation: unconstrained + grammar-guided`)
    
    const appMode = useAppModeState.getState().appMode
    
    // Check if grammar is enabled
    const currentSampler = SamplersManager.getCurrentSampler()
    const hasGrammar = currentSampler.grammar_string && String(currentSampler.grammar_string).trim().length > 0
    
    if (!hasGrammar) {
        Logger.info('No grammar constraints found, falling back to standard generation')
        return await generateResponse(swipeId)
    }
    
    Logger.info('Grammar constraints detected, starting dual-generation process')
    
    if (appMode === 'local') {
        await BackgroundService.start(() => localDualInference(swipeId), completionTaskOptions)
    } else {
        await BackgroundService.start(() => remoteDualInference(swipeId), completionTaskOptions)
    }
}

// Local dual inference implementation
const localDualInference = async (swipeId: number) => {
    try {
        Logger.info('Starting local dual-generation')
        
        // Store original grammar
        const originalSampler = SamplersManager.getCurrentSampler()
        const originalGrammar = originalSampler.grammar_string
        const hasGrammar = !!(originalGrammar && String(originalGrammar).trim().length > 0)
        const rescueAPIEnabled = mmkv.getBoolean(RescueAPISettings.Enabled) ?? false
        
        // If Rescue API is enabled and we have grammar, skip Phase 1
        if (rescueAPIEnabled && hasGrammar) {
            Logger.info('Rescue API enabled with grammar - generating only grammar-constrained response')
            
            // Generate with grammar
            const grammarResult = await runSingleLocalGeneration()
            
            // Handle Rescue API reporting
            await handleRescueAPIReporting(grammarResult, hasGrammar)
            
            // Save grammar-constrained result to conversation
            const regenCache = Chats.useChatState.getState().getRegenCache()
            Chats.useChatState.getState().setBuffer({ 
                data: regenCache + grammarResult, 
                timings: undefined 
            })
            
            useInference.getState().stopGenerating()
            return
        }
        
        // Otherwise, do the original dual generation
        // Phase 1: Generate without grammar
        Logger.info('Phase 1: Generating without grammar constraints')
        SamplersManager.useSamplerState.getState().updateCurrentConfig({
            ...SamplersManager.useSamplerState.getState().configList[SamplersManager.useSamplerState.getState().currentConfigIndex],
            data: {
                ...originalSampler,
                grammar_string: ''
            }
        })
        
        const phase1Result = await runSingleLocalGeneration()
        
        // Phase 2: Generate with grammar (for comparison/guidance)
        Logger.info('Phase 2: Generating with grammar constraints')
        SamplersManager.useSamplerState.getState().updateCurrentConfig({
            ...SamplersManager.useSamplerState.getState().configList[SamplersManager.useSamplerState.getState().currentConfigIndex],
            data: {
                ...originalSampler,
                grammar_string: originalGrammar
            }
        })
        
        const phase2Result = await runSingleLocalGeneration()
        
        // Restore original grammar - ensure it persists
        const state = SamplersManager.useSamplerState.getState()
        const currentConfigIndex = state.currentConfigIndex
        const currentConfig = state.configList[currentConfigIndex]
        
        SamplersManager.useSamplerState.getState().updateCurrentConfig({
            ...currentConfig,
            data: {
                ...currentConfig.data,
                grammar_string: originalGrammar
            }
        })
        
        Logger.info(`Grammar restored: ${originalGrammar ? 'enabled' : 'disabled'}`)
        
        // Save only Phase 1 (unconstrained) result to conversation
        Logger.info('Saving unconstrained generation to conversation')
        Logger.info(`Grammar-guided generation (reference): ${phase2Result.substring(0, 100)}...`)
        
        // Handle Rescue API reporting with the grammar-guided result
        await handleRescueAPIReporting(phase2Result, hasGrammar)
        
        const regenCache = Chats.useChatState.getState().getRegenCache()
        Chats.useChatState.getState().setBuffer({ 
            data: regenCache + phase1Result, 
            timings: undefined 
        })
        
        useInference.getState().stopGenerating()
        
    } catch (error) {
        Logger.errorToast(`Dual generation failed: ${error}`)
        useInference.getState().stopGenerating()
    }
}

// Remote dual inference implementation
const remoteDualInference = async (swipeId: number) => {
    try {
        Logger.info('Starting remote dual-generation')
        
        // Store original grammar
        const originalSampler = SamplersManager.getCurrentSampler()
        const originalGrammar = originalSampler.grammar_string
        const hasGrammar = !!(originalGrammar && String(originalGrammar).trim().length > 0)
        const rescueAPIEnabled = mmkv.getBoolean(RescueAPISettings.Enabled) ?? false
        
        // If Rescue API is enabled and we have grammar, skip Phase 1
        if (rescueAPIEnabled && hasGrammar) {
            Logger.info('Rescue API enabled with grammar - generating only grammar-constrained response')
            
            // Generate with grammar
            const grammarResult = await runSingleRemoteGeneration()
            
            // Handle Rescue API reporting
            await handleRescueAPIReporting(grammarResult, hasGrammar)
            
            // Save grammar-constrained result to conversation
            const regenCache = Chats.useChatState.getState().getRegenCache()
            Chats.useChatState.getState().setBuffer({ 
                data: regenCache + grammarResult, 
                timings: undefined 
            })
            
            useInference.getState().stopGenerating()
            return
        }
        
        // Otherwise, do the original dual generation
        // Phase 1: Generate without grammar
        Logger.info('Phase 1: Generating without grammar constraints')
        SamplersManager.useSamplerState.getState().updateCurrentConfig({
            ...SamplersManager.useSamplerState.getState().configList[SamplersManager.useSamplerState.getState().currentConfigIndex],
            data: {
                ...originalSampler,
                grammar_string: ''
            }
        })
        
        const phase1Result = await runSingleRemoteGeneration()
        
        // Phase 2: Generate with grammar
        Logger.info('Phase 2: Generating with grammar constraints')
        SamplersManager.useSamplerState.getState().updateCurrentConfig({
            ...SamplersManager.useSamplerState.getState().configList[SamplersManager.useSamplerState.getState().currentConfigIndex],
            data: {
                ...originalSampler,
                grammar_string: originalGrammar
            }
        })
        
        const phase2Result = await runSingleRemoteGeneration()
        
        // Restore original grammar - ensure it persists  
        const state = SamplersManager.useSamplerState.getState()
        const currentConfigIndex = state.currentConfigIndex
        const currentConfig = state.configList[currentConfigIndex]
        
        SamplersManager.useSamplerState.getState().updateCurrentConfig({
            ...currentConfig,
            data: {
                ...currentConfig.data,
                grammar_string: originalGrammar
            }
        })
        
        Logger.info(`Grammar restored: ${originalGrammar ? 'enabled' : 'disabled'}`)
        
        // Save only Phase 1 (unconstrained) result
        Logger.info('Saving unconstrained generation to conversation')
        Logger.info(`Grammar-guided generation (reference): ${phase2Result.substring(0, 100)}...`)
        
        // Handle Rescue API reporting with the grammar-guided result
        await handleRescueAPIReporting(phase2Result, hasGrammar)
        
        const regenCache = Chats.useChatState.getState().getRegenCache()
        Chats.useChatState.getState().setBuffer({ 
            data: regenCache + phase1Result, 
            timings: undefined 
        })
        
        useInference.getState().stopGenerating()
        
    } catch (error) {
        Logger.errorToast(`Remote dual generation failed: ${error}`)
        useInference.getState().stopGenerating()
    }
}

// Helper function for single local generation
const runSingleLocalGeneration = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
        let generatedText = ''
        let originalBuffer = ''
        
        // Store original buffer state
        const chatState = Chats.useChatState.getState()
        originalBuffer = chatState.buffer?.data || ''
        
        // Clear buffer for this generation
        chatState.setBuffer({ data: '' })
        
        // Override buffer insertion to capture text
        const originalInsertBuffer = chatState.insertBuffer
        chatState.insertBuffer = (text: string) => {
            generatedText += text
        }
        
        // Override setBuffer to capture final result
        const originalSetBuffer = chatState.setBuffer
        chatState.setBuffer = (buffer: any) => {
            generatedText = buffer.data
            resolve(generatedText)
            
            // Restore original functions
            chatState.insertBuffer = originalInsertBuffer
            chatState.setBuffer = originalSetBuffer
        }
        
        // Run local inference
        localInference().catch((error) => {
            // Restore original functions on error
            chatState.insertBuffer = originalInsertBuffer
            chatState.setBuffer = originalSetBuffer
            reject(error)
        })
    })
}

// Helper function for single remote generation
const runSingleRemoteGeneration = async (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const fields = await obtainFields()
            if (!fields) {
                reject('Failed to obtain fields')
                return
            }

            let generatedText = ''
            
            fields.onData = (text) => {
                generatedText += text
            }
            
            fields.onEnd = () => {
                resolve(generatedText)
            }
            
            fields.stopGenerating = () => {
                reject('Generation stopped')
            }

            await buildAndSendRequest(fields)
        } catch (error) {
            reject(error)
        }
    })
}

const completionTaskOptions = {
    taskName: 'chatterui_completion_task',
    taskTitle: 'Running completion...',
    taskDesc: 'ChatterUI is running a completion task',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#403737',
    linkingURI: 'chatterui://',
    progressBar: {
        max: 1,
        value: 0,
        indeterminate: true,
    },
}

export const generateResponse = async (swipeId: number) => {
    if (useInference.getState().nowGenerating) {
        Logger.infoToast('Generation already in progress')
        return
    }
    Chats.useChatState.getState().startGenerating(swipeId)
    Logger.info(`Obtaining response.`)
    const appMode = useAppModeState.getState().appMode

    if (appMode === 'local') {
        await BackgroundService.start(localInference, completionTaskOptions)
    } else {
        await BackgroundService.start(chatInferenceStream, completionTaskOptions)
    }
}
// TODO: Use this
const useGenerateResponse = () => {
    const startGenerating = Chats.useChatState((state) => state.startGenerating)
    const nowGenerating = useInference((state) => state.nowGenerating)
    const appMode = useAppModeState((state) => state.appMode)

    const generateResponse = useCallback(
        async (swipeId: number) => {
            if (nowGenerating) {
                Logger.infoToast('Generation already in progress')
                return
            }
            startGenerating(swipeId)
            Logger.info(`Obtaining response.`)
            const process = appMode === 'local' ? localInference : chatInferenceStream
            await BackgroundService.start(process, completionTaskOptions)
        },
        [nowGenerating, appMode]
    )

    return generateResponse
}

const chatInferenceStream = async () => {
    const fields = await obtainFields()
    const stop = () => Chats.useChatState.getState().stopGenerating()
    if (!fields) {
        Logger.error('Chat Inference Failed')
        stop()
        return
    }
    fields.stopGenerating = stop
    fields.onData = (text) => {
        Chats.useChatState.getState().insertBuffer(text)
        useTTSState.getState().insertBuffer(text)
    }
    fields.onEnd = async () => {
        const chat = Chats.useChatState.getState().data
        if (!mmkv.getBoolean(AppSettings.AutoGenerateTitle) || !chat || chat?.name !== 'New Chat')
            return
        Logger.info('Generating Title')
        titleGeneratorStream(chat.id)
    }
    const abort = await buildAndSendRequest(fields)
    useInference.getState().setAbort(() => {
        Logger.debug('Running Abort')
        if (abort) abort()
    })
}

const titleGeneratorStream = async (chatId: number) => {
    const fields = await obtainFields()
    if (!fields) {
        Logger.error('Title Generation Failed')
        return
    }
    fields.samplers.genamt = 50
    let output = ''
    fields.onData = (text) => {
        output += text
    }
    fields.onEnd = () => {
        Logger.debug('Autogenerated Name: ' + output)
        if (output)
            Chats.useChatState
                .getState()
                .renameChat(chatId, output.substring(0, 50).trim().replace(/["'.]/g, ''))
        else Logger.warn('Autogenerated name was blank.')
    }
    const entry = {
        id: -1,
        chat_id: -1,
        name: '',
        is_user: true,
        order: 0,
        swipe_id: 0,
        swipes: [
            {
                id: -1,
                entry_id: -1,
                swipe: 'Generate a short 2-4 word title for this chat. Only Respond with the title and nothing else.',
                send_date: new Date(),
                gen_started: new Date(),
                gen_finished: new Date(),
                timings: null,
            },
        ],
        attachments: [],
    }
    fields.messages.push(entry)

    await buildAndSendRequest(fields)
}

const getModelContextLength = (config: APIConfiguration, values: APIValues): number | undefined => {
    const keys = config.model.contextSizeParser.split('.')
    const result = keys.reduce((acc, key) => acc?.[key], values.model)
    return Number.isInteger(result) ? result : undefined
}

// This is the 'big orchestrator' which compiles fields from
// the whole app to send inference requests
const obtainFields = async (): Promise<APIBuilderParams | void> => {
    try {
        const userState = Characters.useUserCard.getState()
        const characterState = Characters.useCharacterCard.getState()
        const chatState = Chats.useChatState.getState()
        const apiState = APIState.useAPIState.getState()
        const instructState = Instructs.useInstruct.getState()

        const userCard = userState.card
        if (!userCard) {
            Logger.errorToast('No loaded user')
            return
        }

        const characterCard = characterState.card
        if (!characterCard) {
            Logger.errorToast('No loaded character')
            return
        }
        const messages = chatState.data?.messages
        if (!messages) {
            Logger.errorToast('No chat character')
            return
        }

        const apiValues = apiState.values.find((item, index) => index === apiState.activeIndex)
        if (!apiValues) {
            Logger.warnToast(`No Active API`)
            return
        }

        const configs = apiState.getTemplates().filter((item) => item.name === apiValues.configName)

        const apiConfig = configs[0]
        if (!apiConfig) {
            Logger.errorToast(`Configuration "${apiValues?.configName}" not found`)
            return
        }
        const samplers = SamplersManager.getCurrentSampler()
        const modelLengthField = getModelContextLength(apiConfig, apiValues)
        const instructLength = samplers.max_length as number
        const modelLength = modelLengthField ?? (instructLength as number)
        const length = apiConfig.model.useModelContextLength
            ? Math.min(modelLength, instructLength)
            : instructLength - (samplers.genamt as number)

        return {
            apiConfig: Object.assign({}, apiConfig),
            apiValues: Object.assign({}, apiValues),
            onData: () => {},
            onEnd: () => {},
            instruct: instructState.replacedMacros(),
            samplers: Object.assign({}, samplers),
            character: Object.assign({}, characterCard),
            user: Object.assign({}, userCard),
            messages: [...messages],
            stopSequence: instructState.getStopSequence(),
            stopGenerating: () => {},
            chatTokenizer: async (entry, index) => {
                // IMPORTANT - we use -1 for dummy entries
                if (entry.id === -1) return 0
                return await chatState.getTokenCount(index)
            },
            tokenizer: Tokenizer.getTokenizer(),
            maxLength: length,
            cache: {
                userCache: await characterState.getCache(characterCard.name),
                characterCache: await userState.getCache(userCard.name),
                instructCache: await instructState.getCache(characterCard.name, userCard.name),
            },
        }
    } catch (e) {
        Logger.errorToast('Failed to orchestrate request build: ' + e)
    }
}
