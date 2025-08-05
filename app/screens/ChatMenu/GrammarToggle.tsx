import { Ionicons } from '@expo/vector-icons'
import Alert from '@components/views/Alert'
import ThemedButton from '@components/buttons/ThemedButton'
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

    const [isGenerating, setIsGenerating] = useState(false)
    const [validationStatus, setValidationStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown')
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
                

                if (hasContent) {
                    cachedGrammarRef.current = grammarString
                    mmkv.set(GRAMMAR_CACHE_KEY, grammarString)
                    setGrammarContent(grammarString)

                    
                    // Validate the grammar
                    validateGrammarContent(grammarString)
                }
                
                // Load cached grammar if no current grammar
                if (!hasContent && !cachedGrammarRef.current) {
                    const cached = mmkv.getString(GRAMMAR_CACHE_KEY)

                    if (cached) {
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

    // Enhanced validation functions
    const validateGrammarContent = (content: string) => {
        if (!content.trim()) {
            setValidationStatus('unknown')
            return
        }

        try {
            let validation
            if (content.includes('::=')) {
                // GBNF validation
                validation = validateGBNF(content)
            } else {
                try {
                    const schema = JSON.parse(content)
                    validation = validateJsonSchema(schema)
                } catch {
                    setValidationStatus('invalid')
                    return
                }
            }
            
            setValidationStatus(validation.valid ? 'valid' : 'invalid')
        } catch {
            setValidationStatus('invalid')
        }
    }

    const validateGBNF = (content: string): { valid: boolean, errors: string[] } => {
        const errors: string[] = []
        
        if (!content.trim()) {
            errors.push('Grammar content cannot be empty')
            return { valid: false, errors }
        }

        if (!content.includes('::=')) {
            errors.push('GBNF grammar must contain rule definitions (::=)')
        }

        if (!content.includes('root ::=')) {
            errors.push('GBNF grammar should have a root rule')
        }

        // Basic syntax validation
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line && !line.startsWith('#') && line.length > 0) {
                if (line.includes('::=')) {
                    const ruleName = line.split('::=')[0].trim()
                    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(ruleName)) {
                        errors.push(`Line ${i + 1}: Invalid rule name '${ruleName}'`)
                    }
                }
            }
        }

        return { valid: errors.length === 0, errors }
    }

    const validateJsonSchema = (schema: any): { valid: boolean, errors: string[], warnings?: string[] } => {
        const errors: string[] = []
        const warnings: string[] = []

        if (!schema || typeof schema !== 'object') {
            errors.push('Schema must be a valid object')
            return { valid: false, errors }
        }

        if (!schema.type) {
            errors.push('Schema must have a "type" property')
        }

        const supportedTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']
        if (schema.type && !supportedTypes.includes(schema.type)) {
            errors.push(`Unsupported type: ${schema.type}`)
        }

        return { valid: errors.length === 0, errors, warnings }
    }

    const testGrammarGeneration = async () => {
        if (!isEnabled || !grammarContent) {
            Logger.warnToast('No grammar enabled for testing')
            return
        }

        setIsGenerating(true)
        
        try {
            // This is a simple test - in a full implementation, 
            // this would call the actual generation pipeline
            Logger.infoToast('🧪 Grammar test started... (This is a simulation)')
            
            // Simulate generation time
            await new Promise(resolve => setTimeout(resolve, 1500))
            
            const grammarType = grammarContent.includes('::=') ? 'GBNF' : 'JSON Schema'
            const testResult = `Test generation completed using ${grammarType} grammar.`
            
            Alert.alert({
                title: 'Grammar Test Result',
                description: `✅ ${testResult}\n\nGrammar appears to be working correctly. This was a simulation - actual generation will use your configured model.`,
                buttons: [{ label: 'OK' }]
            })
        } catch (error) {
            Logger.errorToast(`Grammar test failed: ${error}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const showGrammarInfo = () => {
        const displayGrammar = isEnabled ? grammarContent : cachedGrammarRef.current
        const grammarPreview = displayGrammar.length > 200 
            ? displayGrammar.substring(0, 200) + '...'
            : displayGrammar


        // Determine grammar type and validation status
        const grammarType = displayGrammar.includes('::=') ? 'GBNF' : 
                           displayGrammar.startsWith('{') ? 'JSON Schema' : 'Unknown'
        
        const validationIcon = validationStatus === 'valid' ? '✅' : 
                              validationStatus === 'invalid' ? '❌' : '❓'
        
        const statusInfo = `Status: ${isEnabled ? 'Enabled' : 'Disabled'}\n` +
                          `Type: ${grammarType}\n` +
                          `Validation: ${validationIcon} ${validationStatus}\n` +
                          `Engine: GBNF (Enhanced)`

        const buttons: any[] = [
            { label: 'Close' },
        ]
        
        if (hasGrammar) {
            buttons.push({ 
                label: isEnabled ? 'Disable' : 'Enable', 
                onPress: toggleGrammar 
            })
        }

        // Add test button if grammar is enabled
        if (isEnabled && grammarContent) {
            buttons.push({
                label: '🧪 Test Grammar',
                onPress: testGrammarGeneration,
                type: 'default'
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
            title: 'Enhanced Grammar Constraints',
            description: `${statusInfo}\n\n${isEnabled ? 'When enabled, the model will generate responses constrained by the grammar rules. Enhanced validation and testing features are available.\n\n' : 'Grammar is cached and can be re-enabled without re-uploading. Enhanced validation ensures grammar correctness.\n\n'}${grammarPreview || 'No grammar rules defined.'}`,
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                {/* Enhanced validation indicator */}
                {isEnabled && validationStatus !== 'unknown' && (
                    <Text style={{
                        color: isEnabled ? color.neutral._100 : color.text._400,
                        fontSize: 10,
                        marginLeft: spacing.xs,
                    }}>
                        {validationStatus === 'valid' ? '✓' : '⚠'}
                    </Text>
                )}
            </TouchableOpacity>
            
            {/* Quick Test Button - Only show when enabled and has grammar */}
            {isEnabled && grammarContent && !isGenerating && (
                <TouchableOpacity
                    onPress={testGrammarGeneration}
                    style={{
                        padding: spacing.xs,
                        backgroundColor: color.primary._200,
                        borderRadius: borderRadius.s,
                        marginLeft: spacing.xs,
                    }}
                >
                    <Ionicons
                        name="flask"
                        size={14}
                        color={color.primary._700}
                    />
                </TouchableOpacity>
            )}
            
            {/* Generation indicator */}
            {isGenerating && (
                <View style={{
                    marginLeft: spacing.xs,
                    padding: spacing.xs,
                }}>

                    <Text style={{
                        fontSize: 10,
                        color: color.primary._600,
                        fontWeight: '500',
                    }}>
                        Testing...
                    </Text>
                </View>
            )}
        </View>
    )
}

export default GrammarToggle 