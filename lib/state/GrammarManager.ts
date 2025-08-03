import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStateStorage } from '@lib/storage/SQLiteStorage'
import { SamplersManager } from '@lib/state/SamplerState'
import { Logger } from '@lib/state/Logger'
import { getDocumentAsync } from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'

export interface GrammarState {
    currentGrammar: string
    cachedGrammar: string
    customGrammarPath: string
    isEnabled: boolean
    hasGrammar: boolean
    defaultGrammarLoaded: boolean
}

export interface GrammarActions {
    setGrammar: (grammar: string, cache?: boolean) => void
    toggleGrammar: () => void
    loadGrammarFromFile: () => Promise<void>
    loadDefaultGrammar: (grammar: string, name?: string) => void
    clearGrammar: () => void
    resetToDefaults: () => void
    syncWithSamplerState: () => void
}

export type GrammarStore = GrammarState & GrammarActions

const defaultState: GrammarState = {
    currentGrammar: '',
    cachedGrammar: '',
    customGrammarPath: '',
    isEnabled: false,
    hasGrammar: false,
    defaultGrammarLoaded: false,
}

export const useGrammarManager = create<GrammarStore>()(
    persist(
        (set, get) => ({
            ...defaultState,

            setGrammar: (grammar: string, cache = true) => {
                const state = get()
                
                // Update sampler configuration
                const samplerState = SamplersManager.useSamplerState.getState()
                const currentConfig = samplerState.configList[samplerState.currentConfigIndex]
                
                if (currentConfig) {
                    const updatedConfig = {
                        ...currentConfig,
                        data: {
                            ...currentConfig.data,
                            grammar_string: grammar,
                        },
                    }
                    samplerState.updateCurrentConfig(updatedConfig)
                }

                // Update state
                set({
                    currentGrammar: grammar,
                    cachedGrammar: cache ? grammar : state.cachedGrammar,
                    isEnabled: grammar.length > 0,
                    hasGrammar: grammar.length > 0 || state.cachedGrammar.length > 0,
                })

                if (grammar.length > 0) {
                    Logger.infoToast('Grammar applied successfully')
                }
            },

            toggleGrammar: () => {
                const state = get()
                const actions = get()
                
                if (state.isEnabled) {
                    // Disabling - cache current grammar if it exists
                    if (state.currentGrammar) {
                        set({ cachedGrammar: state.currentGrammar })
                    }
                    actions.setGrammar('', false)
                    Logger.infoToast('Grammar constraints disabled')
                } else {
                    // Enabling - restore cached grammar
                    if (state.cachedGrammar) {
                        actions.setGrammar(state.cachedGrammar, false)
                        Logger.infoToast('Grammar constraints enabled')
                    } else {
                        Logger.warnToast('No grammar available. Load a grammar file first.')
                    }
                }
            },

            loadGrammarFromFile: async () => {
                try {
                    const result = await getDocumentAsync({
                        type: ['text/*', 'application/octet-stream'],
                        copyToCacheDirectory: true,
                    })

                    if (result.canceled || !result.assets[0]) {
                        return
                    }

                    const file = result.assets[0]
                    const fileName = file.name.toLowerCase()

                    // Validate file type
                    if (!fileName.endsWith('.gbnf') && !fileName.endsWith('.txt')) {
                        Logger.errorToast('Please select a .gbnf or .txt file')
                        return
                    }

                    const grammarContent = await FileSystem.readAsStringAsync(file.uri)

                    if (!grammarContent || grammarContent.trim().length === 0) {
                        Logger.errorToast('File appears to be empty')
                        return
                    }

                    // Basic GBNF syntax validation
                    if (!grammarContent.includes('::=')) {
                        Logger.warnToast('File may not be valid GBNF format (missing ::= rules)')
                    }

                    // Apply grammar and store file reference
                    const actions = get()
                    actions.setGrammar(grammarContent)
                    set({ customGrammarPath: file.name })

                    Logger.infoToast(`Grammar loaded from ${file.name}`)
                } catch (error) {
                    Logger.errorToast(`Failed to load grammar file: ${error}`)
                }
            },

            loadDefaultGrammar: (grammar: string, name = 'default grammar') => {
                const actions = get()
                actions.setGrammar(grammar)
                set({ 
                    defaultGrammarLoaded: true,
                    customGrammarPath: '', // Clear custom path when loading default
                })
                Logger.infoToast(`${name} loaded successfully`)
            },

            clearGrammar: () => {
                const actions = get()
                actions.setGrammar('')
                set({
                    cachedGrammar: '',
                    customGrammarPath: '',
                    defaultGrammarLoaded: false,
                })
                Logger.infoToast('Grammar cleared')
            },

            resetToDefaults: () => {
                set(defaultState)
                const actions = get()
                actions.setGrammar('')
                Logger.infoToast('Grammar settings reset to defaults')
            },

            syncWithSamplerState: () => {
                const samplerState = SamplersManager.useSamplerState.getState()
                const currentConfig = samplerState.configList[samplerState.currentConfigIndex]
                
                if (currentConfig) {
                    const grammarString = String(currentConfig.data.grammar_string || '')
                    const hasContent = grammarString.trim().length > 0
                    
                    set({
                        currentGrammar: grammarString,
                        isEnabled: hasContent,
                        hasGrammar: hasContent || get().cachedGrammar.length > 0,
                    })
                    
                    // Cache current grammar if it exists
                    if (hasContent && grammarString !== get().cachedGrammar) {
                        set({ cachedGrammar: grammarString })
                    }
                }
            },
        }),
        {
            name: 'grammar-manager',
            storage: createJSONStorage(() => sqliteStateStorage),
            version: 1,
        }
    )
)

// Utility functions for common grammar operations
export const GrammarManager = {
    // Load specific grammar templates
    loadVictimSchema: (grammar: string) => {
        const actions = useGrammarManager.getState()
        actions.loadDefaultGrammar(grammar, 'Victim Schema Grammar')
    },

    loadSimpleJson: (grammar: string) => {
        const actions = useGrammarManager.getState()
        actions.loadDefaultGrammar(grammar, 'Simple JSON Grammar')
    },

    // Check if grammar is currently active
    isActive: (): boolean => {
        return useGrammarManager.getState().isEnabled
    },

    // Get current grammar content
    getCurrentGrammar: (): string => {
        return useGrammarManager.getState().currentGrammar
    },

    // Subscribe to grammar state changes
    subscribe: (callback: (state: GrammarStore) => void) => {
        return useGrammarManager.subscribe(callback)
    },
}