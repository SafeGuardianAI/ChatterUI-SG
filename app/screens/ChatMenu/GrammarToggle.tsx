import { Ionicons } from '@expo/vector-icons'
import Alert from '@components/views/Alert'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { Theme } from '@lib/theme/ThemeManager'
import React, { useEffect, useState, useRef } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { mmkv } from '@lib/storage/MMKV'
import { VICTIM_SCHEMA_GRAMMAR } from '@lib/constants/VictimGrammar'

const GRAMMAR_CACHE_KEY = 'cached_grammar_content'
const DEFAULT_GRAMMAR_LOADED_KEY = 'default_grammar_loaded'

const GrammarToggle = () => {
    const { color, spacing, borderRadius } = Theme.useTheme()
    const [isEnabled, setIsEnabled] = useState(false)
    const [hasGrammar, setHasGrammar] = useState(false)
    const [grammarContent, setGrammarContent] = useState('')
    const cachedGrammarRef = useRef<string>('')

    // Load default grammar on first run
    useEffect(() => {
        const loadDefaultGrammarIfNeeded = () => {
            const hasLoadedDefault = mmkv.getBoolean(DEFAULT_GRAMMAR_LOADED_KEY)
            const hasCachedGrammar = mmkv.getString(GRAMMAR_CACHE_KEY)
            
            if (!hasLoadedDefault && !hasCachedGrammar) {
                // First time running, load default victim grammar
                Logger.info('First run detected, loading default victim grammar')
                
                const state = SamplersManager.useSamplerState.getState()
                const currentConfig = state.configList[state.currentConfigIndex]
                
                if (currentConfig) {
                    const updatedConfig = {
                        ...currentConfig,
                        data: {
                            ...currentConfig.data,
                            grammar_string: VICTIM_SCHEMA_GRAMMAR,
                        },
                    }
                    
                    state.updateCurrentConfig(updatedConfig)
                    mmkv.set(GRAMMAR_CACHE_KEY, VICTIM_SCHEMA_GRAMMAR)
                    mmkv.set(DEFAULT_GRAMMAR_LOADED_KEY, true)
                    cachedGrammarRef.current = VICTIM_SCHEMA_GRAMMAR
                    setGrammarContent(VICTIM_SCHEMA_GRAMMAR)
                    setHasGrammar(true)
                    setIsEnabled(true)
                    
                    Logger.infoToast('Default victim grammar loaded')
                }
            }
        }

        // Run after a short delay to ensure the app is fully initialized
        const timer = setTimeout(loadDefaultGrammarIfNeeded, 500)
        return () => clearTimeout(timer)
    }, [])

    // Check current grammar state
    useEffect(() => {
        const checkGrammarState = () => {
            const state = SamplersManager.useSamplerState.getState()
            const currentConfig = state.configList[state.currentConfigIndex]
            
            if (currentConfig) {
                const grammarString = String(currentConfig.data.grammar_string || '')
                const hasContent = grammarString.trim().length > 0
                
                // If we have new grammar content, cache it
                if (hasContent) {
                    cachedGrammarRef.current = grammarString
                    mmkv.set(GRAMMAR_CACHE_KEY, grammarString)
                    setGrammarContent(grammarString)
                }
                
                // Load cached grammar if no current grammar
                if (!hasContent && !cachedGrammarRef.current) {
                    const cached = mmkv.getString(GRAMMAR_CACHE_KEY)
                    if (typeof cached === 'string') {
                        cachedGrammarRef.current = cached
                        setGrammarContent(cached)
                    }
                }
                
                setIsEnabled(hasContent)
                setHasGrammar(hasContent || !!cachedGrammarRef.current)
            }
        }

        checkGrammarState()
        
        // Subscribe to sampler state changes
        const unsubscribe = SamplersManager.useSamplerState.subscribe(checkGrammarState)
        return unsubscribe
    }, [])

    const toggleGrammar = () => {
        const state = SamplersManager.useSamplerState.getState()
        const currentConfig = state.configList[state.currentConfigIndex]
        
        if (!currentConfig) return

        let newGrammarValue = ''

        if (!isEnabled) {
            // Enabling - use cached grammar
            if (cachedGrammarRef.current) {
                newGrammarValue = cachedGrammarRef.current
            } else {
                Logger.warnToast('No grammar rules available. Upload a grammar file first.')
                return
            }
        } else {
            // Disabling - cache current grammar before clearing
            const currentGrammar = String(currentConfig.data.grammar_string || '')
            if (currentGrammar) {
                cachedGrammarRef.current = currentGrammar
                mmkv.set(GRAMMAR_CACHE_KEY, currentGrammar)
            }
            newGrammarValue = ''
        }

        const updatedConfig = {
            ...currentConfig,
            data: {
                ...currentConfig.data,
                grammar_string: newGrammarValue,
            },
        }

        state.updateCurrentConfig(updatedConfig)
        setIsEnabled(!isEnabled)
        
        // Show feedback
        if (isEnabled) {
            Logger.infoToast('Grammar constraints disabled')
        } else {
            Logger.infoToast('Grammar constraints enabled')
        }
    }

    const showGrammarInfo = () => {
        const displayGrammar = isEnabled ? grammarContent : cachedGrammarRef.current
        const grammarPreview = displayGrammar.length > 200 
            ? displayGrammar.substring(0, 200) + '...'
            : displayGrammar

        const buttons: any[] = [
            { label: 'Close' },
        ]
        
        if (hasGrammar) {
            buttons.push({ 
                label: isEnabled ? 'Disable' : 'Enable', 
                onPress: toggleGrammar 
            })
        }
        
        // Add clear cache option if there's cached grammar
        if (cachedGrammarRef.current && !isEnabled) {
            buttons.push({
                label: 'Clear Cache',
                onPress: clearCache,
                type: 'warning'
            })
        }

        Alert.alert({
            title: 'Grammar Constraints',
            description: `Status: ${isEnabled ? 'Enabled' : 'Disabled'}\n\n${isEnabled ? 'When enabled, the model will generate responses constrained by the grammar rules.\n\n' : 'Grammar is cached and can be re-enabled without re-uploading.\n\n'}${grammarPreview || 'No grammar rules defined.'}`,
            buttons,
        })
    }

    const clearCache = () => {
        Alert.alert({
            title: 'Clear Grammar Cache',
            description: 'This will remove the cached grammar and reset to defaults. You will need to upload a grammar file again or the default will be loaded.',
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Clear',
                    onPress: () => {
                        cachedGrammarRef.current = ''
                        mmkv.delete(GRAMMAR_CACHE_KEY)
                        mmkv.delete(DEFAULT_GRAMMAR_LOADED_KEY)
                        setGrammarContent('')
                        setHasGrammar(false)
                        Logger.infoToast('Grammar cache cleared')
                    },
                    type: 'warning'
                }
            ]
        })
    }

    return (
        <TouchableOpacity
            style={{
                backgroundColor: isEnabled ? color.primary._500 : color.neutral._300,
                borderRadius: borderRadius.m,
                padding: spacing.s,
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: spacing.xs,
                minWidth: 80,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: hasGrammar 
                    ? (isEnabled ? color.primary._500 : color.primary._300)
                    : color.neutral._400,
                opacity: hasGrammar ? 1 : 0.6,
            }}
            onPress={toggleGrammar}
            onLongPress={showGrammarInfo}
            activeOpacity={0.7}>
            <Ionicons
                name={isEnabled ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={isEnabled ? color.neutral._100 : color.text._400}
                style={{ marginRight: spacing.xs }}
            />
            <Text
                style={{
                    color: isEnabled ? color.neutral._100 : color.text._400,
                    fontSize: 12,
                    fontWeight: '500',
                }}>
                Beacon Mode
            </Text>
        </TouchableOpacity>
    )
}

export default GrammarToggle 