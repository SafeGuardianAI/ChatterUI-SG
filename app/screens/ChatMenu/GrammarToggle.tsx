import { Ionicons } from '@expo/vector-icons'
import Alert from '@components/views/Alert'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { Theme } from '@lib/theme/ThemeManager'
import React, { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

const GrammarToggle = () => {
    const { color, spacing, borderRadius } = Theme.useTheme()
    const [isEnabled, setIsEnabled] = useState(false)
    const [hasGrammar, setHasGrammar] = useState(false)
    const [grammarContent, setGrammarContent] = useState('')

    // Check current grammar state
    useEffect(() => {
        const checkGrammarState = () => {
            const state = SamplersManager.useSamplerState.getState()
            const currentConfig = state.configList[state.currentConfigIndex]
            
            if (currentConfig) {
                const grammarString = String(currentConfig.data.grammar_string || '')
                setHasGrammar(grammarString.trim().length > 0)
                setIsEnabled(grammarString.trim().length > 0)
                setGrammarContent(grammarString)
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

        const currentGrammar = String(currentConfig.data.grammar_string || '')
        const newGrammarValue = isEnabled ? '' : currentGrammar

        // If there's no grammar to restore, don't enable
        if (!isEnabled && !hasGrammar) {
            Logger.warnToast('No grammar rules available. Upload a grammar file first.')
            return
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
        const grammarPreview = grammarContent.length > 200 
            ? grammarContent.substring(0, 200) + '...'
            : grammarContent

        Alert.alert({
            title: 'Grammar Constraints',
<<<<<<< HEAD
            description: `Status: ${isEnabled ? 'Enabled' : 'Disabled'}\n\n${grammarPreview || 'No grammar rules defined.'}`,
=======
            description: `Status: ${isEnabled ? 'Enabled' : 'Disabled'}\n\n${isEnabled ? 'When enabled, the model generates twice:\n• First without grammar (saved to conversation)\n• Then with grammar (for guidance)\n\nThis ensures natural conversation flow while respecting grammar rules.\n\n' : ''}${grammarPreview || 'No grammar rules defined.'}`,
>>>>>>> 466189f4b6895fe6260e842a8c961e9902000a41
            buttons: [
                { label: 'Close' },
                ...(hasGrammar ? [{ 
                    label: isEnabled ? 'Disable' : 'Enable', 
                    onPress: toggleGrammar 
                }] : [])
            ],
        })
    }

<<<<<<< HEAD
    // If no grammar is available, don't show the toggle
    if (!hasGrammar && !isEnabled) {
        return null
    }

=======
>>>>>>> 466189f4b6895fe6260e842a8c961e9902000a41
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
<<<<<<< HEAD
                borderWidth: hasGrammar && !isEnabled ? 1 : 0,
                borderColor: hasGrammar && !isEnabled ? color.primary._300 : 'transparent',
=======
                borderWidth: 1,
                borderColor: hasGrammar 
                    ? (isEnabled ? color.primary._500 : color.primary._300)
                    : color.neutral._400,
                opacity: hasGrammar ? 1 : 0.6,
>>>>>>> 466189f4b6895fe6260e842a8c961e9902000a41
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
                Grammar
            </Text>
        </TouchableOpacity>
    )
}

export default GrammarToggle 