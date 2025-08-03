import ThemedButton from '@components/buttons/ThemedButton'
import DropdownSheet from '@components/input/DropdownSheet'
import ThemedCheckbox from '@components/input/ThemedCheckbox'
import ThemedSlider from '@components/input/ThemedSlider'
import ThemedTextInput from '@components/input/ThemedTextInput'
import Alert from '@components/views/Alert'
import HeaderButton from '@components/views/HeaderButton'
import HeaderTitle from '@components/views/HeaderTitle'
import PopupMenu from '@components/views/PopupMenu'
import TextBoxModal from '@components/views/TextBoxModal'
import { Samplers } from '@lib/constants/SamplerData'
import { APIConfiguration, APISampler } from '@lib/engine/API/APIBuilder.types'
import { APIState as APIStateNew } from '@lib/engine/API/APIManagerState'
import { localSamplerData } from '@lib/engine/LocalInference'
import { useAppMode } from '@lib/state/AppMode'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { Theme } from '@lib/theme/ThemeManager'
import { saveStringToDownload } from '@lib/utils/File'
import { convertJsonSchemaToGrammar } from 'cui-llama.rn'
import { getDocumentAsync } from 'expo-document-picker'
import { readAsStringAsync } from 'expo-file-system'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'

const SamplerMenu = () => {
    const styles = useStyles()
    const { spacing } = Theme.useTheme()
    const { appMode } = useAppMode()
    const [showNewSampler, setShowNewSampler] = useState<boolean>(false)

    const {
        addSamplerConfig,
        deleteSamplerConfig,
        changeConfig,
        updateCurrentConfig,
        currentConfigIndex,
        currentConfig,
        configList,
    } = SamplersManager.useSamplers()

    const { apiValues, activeIndex, getTemplates } = APIStateNew.useAPIState(
        useShallow((state) => ({
            apiValues: state.values,
            activeIndex: state.activeIndex,
            getTemplates: state.getTemplates,
        }))
    )

    const getSamplerList = (): APISampler[] => {
        if (appMode === 'local') return localSamplerData
        if (activeIndex !== -1) {
            const template = getTemplates().find(
                (item: APIConfiguration) => item.name === apiValues[activeIndex].configName
            )
            if (!template) return []
            return template.request.samplerFields
        }
        return []
    }

    const handleExportSampler = () => {
        saveStringToDownload(
            JSON.stringify(currentConfig.data),
            `${currentConfig.name}.json`,
            'utf8'
        ).then(() => {
            Logger.infoToast('Downloaded Sampler Configuration!')
        })
    }

    const handleImportSampler = () => {
        //TODO : Implement
        Logger.errorToast('Importing Not Implemented')
    }

    const handleUploadGBNF = async () => {
        try {
            Logger.infoToast('Opening GBNF file picker...')
            
            const result = await getDocumentAsync({
                type: ['text/*', 'application/*', '*/*'],
                copyToCacheDirectory: true,
                multiple: false,
            })
            
            if (result.canceled) {
                Logger.infoToast('File selection cancelled')
                return
            }
            
            if (!result.assets || result.assets.length === 0) {
                Logger.errorToast('No file selected')
                return
            }
            
            const file = result.assets[0]
            const fileName = file.name.toLowerCase()
            
            Logger.infoToast(`Selected file: ${file.name}`)
            
            if (!fileName.endsWith('.gbnf') && !fileName.endsWith('.txt')) {
                Logger.errorToast('Please select a .gbnf or .txt file')
                return
            }
            
            Logger.infoToast('Reading file content...')
            
            let grammarContent
            try {
                grammarContent = await readAsStringAsync(file.uri)
            } catch (readError) {
                console.error('File read error:', readError)
                Logger.errorToast(`Cannot read file: ${(readError as Error)?.message || String(readError)}`)
                return
            }
            
            if (!grammarContent || grammarContent.trim().length === 0) {
                Logger.errorToast('File appears to be empty')
                return
            }
            
            // Enhanced GBNF validation
            const validation = validateGBNF(grammarContent)
            if (!validation.valid) {
                Logger.warnToast(`GBNF validation warnings: ${validation.errors.slice(0, 2).join(', ')}`)
            }
            
            Logger.infoToast('Updating grammar configuration...')
            updateCurrentConfig({
                ...currentConfig,
                data: {
                    ...currentConfig.data,
                    grammar_string: grammarContent,
                },
            })
            
            Logger.info(`📁 GRAMMAR LOADED: GBNF file "${file.name}" (${grammarContent.length} chars)`)
            Logger.infoToast(`Successfully loaded GBNF grammar from ${file.name}`)
        } catch (error) {
            console.error('GBNF Upload Error:', error)
            Logger.errorToast(`Failed to load GBNF file: ${(error as Error)?.message || String(error)}`)
        }
    }

    const handleUploadJSON = async () => {
        try {
            Logger.infoToast('Opening JSON Schema file picker...')
            
            const result = await getDocumentAsync({
                type: ['application/json', 'text/*', '*/*'],
                copyToCacheDirectory: true,
                multiple: false,
            })
            
            if (result.canceled) {
                Logger.infoToast('File selection cancelled')
                return
            }
            
            if (!result.assets || result.assets.length === 0) {
                Logger.errorToast('No file selected')
                return
            }
            
            const file = result.assets[0]
            const fileName = file.name.toLowerCase()
            
            Logger.infoToast(`Selected file: ${file.name}`)
            
            if (!fileName.endsWith('.json')) {
                Logger.errorToast('Please select a .json file')
                return
            }
            
            Logger.infoToast('Reading JSON file...')
            
            let jsonContent
            try {
                jsonContent = await readAsStringAsync(file.uri)
            } catch (readError) {
                console.error('JSON file read error:', readError)
                Logger.errorToast(`Cannot read JSON file: ${(readError as Error)?.message || String(readError)}`)
                return
            }
            
            if (!jsonContent || jsonContent.trim().length === 0) {
                Logger.errorToast('JSON file appears to be empty')
                return
            }
            
            Logger.infoToast('Parsing JSON schema...')
            let jsonSchema
            try {
                jsonSchema = JSON.parse(jsonContent)
            } catch (parseError) {
                Logger.errorToast(`Invalid JSON format: ${(parseError as Error)?.message || String(parseError)}`)
                return
            }
            
            // Enhanced JSON Schema validation
            const validation = validateJsonSchema(jsonSchema)
            if (!validation.valid) {
                Logger.errorToast(`JSON Schema validation failed: ${validation.errors.join(', ')}`)
                return
            }
            
            if (validation.warnings && validation.warnings.length > 0) {
                Logger.warnToast(`JSON Schema warnings: ${validation.warnings.slice(0, 2).join(', ')}`)
            }
            
            Logger.infoToast('Converting JSON schema to GBNF...')
            
            let grammarContent
            try {
                grammarContent = await convertJsonSchemaToGrammar(jsonSchema)
            } catch (conversionError) {
                console.error('JSON to GBNF conversion error:', conversionError)
                const errorMsg = (conversionError as Error)?.message || String(conversionError)
                Logger.errorToast(`Conversion failed: ${errorMsg}`)
                return
            }
            
            const grammarString = await Promise.resolve(grammarContent)
            if (!grammarString || grammarString.trim().length === 0) {
                Logger.errorToast('Conversion resulted in empty grammar')
                return
            }
            
            Logger.infoToast('Updating grammar configuration...')
            updateCurrentConfig({
                ...currentConfig,
                data: {
                    ...currentConfig.data,
                    grammar_string: grammarString,
                },
            })
            
            Logger.info(`📁 GRAMMAR LOADED: JSON Schema "${file.name}" converted to GBNF (${grammarString.length} chars)`)
            Logger.infoToast(`Successfully converted and loaded grammar from ${file.name}`)
        } catch (error) {
            console.error('JSON Upload Error:', error)
            Logger.errorToast(`Failed to process JSON file: ${(error as Error)?.message || String(error)}`)
        }
    }

    const handleUploadLARK = async () => {
        try {
            Logger.infoToast('Opening LARK grammar file picker...')
            
            const result = await getDocumentAsync({
                type: ['text/*', 'application/*', '*/*'],
                copyToCacheDirectory: true,
                multiple: false,
            })
            
            if (result.canceled) {
                Logger.infoToast('File selection cancelled')
                return
            }
            
            if (!result.assets || result.assets.length === 0) {
                Logger.errorToast('No file selected')
                return
            }
            
            const file = result.assets[0]
            const fileName = file.name.toLowerCase()
            
            Logger.infoToast(`Selected file: ${file.name}`)
            
            if (!fileName.endsWith('.lark') && !fileName.endsWith('.txt')) {
                Logger.errorToast('Please select a .lark or .txt file')
                return
            }
            
            Logger.infoToast('Reading LARK file...')
            
            let larkContent
            try {
                larkContent = await readAsStringAsync(file.uri)
            } catch (readError) {
                console.error('LARK file read error:', readError)
                Logger.errorToast(`Cannot read LARK file: ${(readError as Error)?.message || String(readError)}`)
                return
            }
            
            if (!larkContent || larkContent.trim().length === 0) {
                Logger.errorToast('LARK file appears to be empty')
                return
            }
            
            Logger.infoToast('Converting LARK to GBNF...')
            
            let grammarContent
            try {
                grammarContent = convertLarkToGBNF(larkContent)
            } catch (conversionError) {
                console.error('LARK to GBNF conversion error:', conversionError)
                const errorMsg = (conversionError as Error)?.message || String(conversionError)
                Logger.errorToast(`LARK conversion failed: ${errorMsg}`)
                return
            }
            
            if (!grammarContent || grammarContent.trim().length === 0) {
                Logger.errorToast('LARK conversion resulted in empty grammar')
                return
            }
            
            // Validate the converted GBNF
            const validation = validateGBNF(grammarContent)
            if (!validation.valid) {
                Logger.warnToast(`Converted GBNF has warnings: ${validation.errors.slice(0, 2).join(', ')}`)
            }
            
            Logger.infoToast('Updating grammar configuration...')
            updateCurrentConfig({
                ...currentConfig,
                data: {
                    ...currentConfig.data,
                    grammar_string: grammarContent,
                },
            })
            
            Logger.info(`📁 GRAMMAR LOADED: LARK "${file.name}" converted to GBNF (${grammarContent.length} chars)`)
            Logger.infoToast(`Successfully converted and loaded LARK grammar from ${file.name}`)
        } catch (error) {
            console.error('LARK Upload Error:', error)
            Logger.errorToast(`Failed to process LARK file: ${(error as Error)?.message || String(error)}`)
        }
    }

    // Enhanced validation functions
    const validateGBNF = (content: string): { valid: boolean, errors: string[] } => {
        const errors: string[] = []
        
        if (!content.trim()) {
            errors.push('Grammar content cannot be empty')
            return { valid: false, errors }
        }

        // Check for GBNF rule definitions
        if (!content.includes('::=')) {
            errors.push('GBNF grammar must contain rule definitions (::=)')
        }

        // Check for root rule
        if (!content.includes('root ::=')) {
            errors.push('GBNF grammar should have a root rule')
        }

        // Validate rule syntax
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line && !line.startsWith('#') && line.length > 0) {
                // Check if it's a rule definition or continuation
                if (line.includes('::=')) {
                    const ruleName = line.split('::=')[0].trim()
                    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(ruleName)) {
                        errors.push(`Line ${i + 1}: Invalid rule name '${ruleName}'`)
                    }
                } else if (!line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*$/) && !line.includes('|') && !line.includes('"')) {
                    // Could be a continuation line, more complex validation needed
                    // For now, just warn about potential issues
                    if (line.length > 1) {
                        errors.push(`Line ${i + 1}: Potential syntax issue - check GBNF formatting`)
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

        // Check required properties
        if (!schema.type) {
            errors.push('Schema must have a "type" property')
        }

        // Check for supported types
        const supportedTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']
        if (schema.type && !supportedTypes.includes(schema.type)) {
            errors.push(`Unsupported type: ${schema.type}. Supported types: ${supportedTypes.join(', ')}`)
        }

        // Object-specific validation
        if (schema.type === 'object') {
            if (!schema.properties && !schema.additionalProperties) {
                warnings.push('Object type should have properties or additionalProperties defined')
            }
            
            // Check for overly complex nested structures
            if (schema.properties) {
                const checkDepth = (obj: any, depth = 0): number => {
                    if (depth > 5) return depth
                    let maxDepth = depth
                    
                    if (obj && typeof obj === 'object') {
                        if (obj.properties) {
                            for (const prop of Object.values(obj.properties)) {
                                maxDepth = Math.max(maxDepth, checkDepth(prop, depth + 1))
                            }
                        }
                        if (obj.items) {
                            maxDepth = Math.max(maxDepth, checkDepth(obj.items, depth + 1))
                        }
                    }
                    return maxDepth
                }
                
                const depth = checkDepth(schema)
                if (depth > 4) {
                    warnings.push(`Schema is deeply nested (${depth} levels). This may impact performance.`)
                }
            }
        }

        // Array-specific validation
        if (schema.type === 'array') {
            if (!schema.items) {
                warnings.push('Array type should have items defined')
            }
        }

        // String-specific validation
        if (schema.type === 'string') {
            if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 100) {
                warnings.push('Large enum arrays may impact performance')
            }
        }

        return { valid: errors.length === 0, errors, warnings }
    }

    const convertLarkToGBNF = (larkContent: string): string => {
        try {
            Logger.debug('Converting LARK grammar to GBNF format')
            
            // Basic LARK to GBNF conversion
            let gbnfContent = larkContent
            
            // Convert LARK rule syntax to GBNF syntax
            // LARK: rule_name: "literal" | other_rule
            // GBNF: rule_name ::= "literal" | other_rule
            
            // Step 1: Convert rule definitions
            gbnfContent = gbnfContent.replace(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm, '$1$2 ::=')
            
            // Step 2: Convert LARK terminals and rules
            // LARK uses uppercase for terminals, GBNF uses lowercase
            // For now, keep as-is but could add conversion logic
            
            // Step 3: Handle LARK-specific constructs
            // LARK: ?rule_name  (optional rule)
            // GBNF: rule_name?  (convert to optional)
            gbnfContent = gbnfContent.replace(/\?([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1?')
            
            // Step 4: Convert LARK repetition operators
            // LARK: rule_name*  (zero or more)
            // GBNF: rule_name*  (same)
            // LARK: rule_name+  (one or more)  
            // GBNF: rule_name+  (same)
            
            // Step 5: Handle LARK string literals
            // LARK and GBNF both use quotes, so mostly compatible
            
            // Step 6: Convert LARK regex patterns if present
            // LARK: /pattern/
            // GBNF: Need to convert to character classes
            gbnfContent = gbnfContent.replace(/\/([^\/]+)\//g, (match, pattern) => {
                // Basic regex to character class conversion
                if (pattern === '\\d+') return '[0-9]+'
                if (pattern === '\\w+') return '[a-zA-Z0-9_]+'
                if (pattern === '\\s+') return '[ \\t\\n]+'
                // For complex patterns, return as-is with warning
                Logger.warn(`Complex regex pattern detected: ${pattern}. Manual conversion may be needed.`)
                return `[${pattern}]` // Fallback
            })
            
            // Step 7: Ensure there's a root rule
            if (!gbnfContent.includes('root ::=') && !gbnfContent.includes('start ::=')) {
                // Try to find the first rule and make it root
                const firstRule = gbnfContent.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*::=/m)
                if (firstRule) {
                    const ruleName = firstRule[2]
                    gbnfContent = `root ::= ${ruleName}\n\n${gbnfContent}`
                }
            }
            
            // Step 8: Clean up formatting
            gbnfContent = gbnfContent
                .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
                .replace(/^\s+/gm, '') // Remove leading whitespace from lines
                .trim()
            
            return gbnfContent
            
        } catch (error) {
            throw new Error(`LARK to GBNF conversion failed: ${error}`)
        }
    }

    const handleDeleteSampler = () => {
        if (configList.length === 1) {
            Logger.errorToast(`Cannot Delete Last Configuration`)
            return false
        }

        Alert.alert({
            title: `Delete Sampler`,
            description: `Are you sure you want to delete '${currentConfig.name}'?`,
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Delete Sampler',
                    onPress: async () => {
                        deleteSamplerConfig(currentConfigIndex)
                    },
                    type: 'warning',
                },
            ],
        })
        return true
    }

    const headerRight = () => (
        <PopupMenu
            icon="setting"
            iconSize={24}
            placement="bottom"
            options={[
                {
                    label: 'Create Sampler',
                    icon: 'addfile',
                    onPress: (menu) => {
                        setShowNewSampler(true)
                        menu.current?.close()
                    },
                },
                {
                    label: 'Export Sampler',
                    icon: 'download',
                    onPress: (menu) => {
                        handleExportSampler()
                        menu.current?.close()
                    },
                },
                /*{
                    label: 'Import Sampler',
                    icon: 'upload',
                    onPress: (menu) => {
                        handleImportSampler()
                        menu.current?.close()
                    },
                },*/
                {
                    label: 'Delete Sampler',
                    icon: 'delete',
                    onPress: (menu) => {
                        if (handleDeleteSampler()) menu.current?.close()
                    },
                    warning: true,
                },
            ]}
        />
    )

    return (
        <SafeAreaView edges={['bottom']} style={{ flex: 1 }} key={currentConfig.name}>
            <TextBoxModal
                booleans={[showNewSampler, setShowNewSampler]}
                onConfirm={(text: string) => {
                    if (text === '') {
                        Logger.errorToast(`Sampler name cannot be empty`)
                        return
                    }

                    for (const item of configList)
                        if (item.name === text) {
                            Logger.errorToast(`Sampler name already exists.`)
                            return
                        }
                    addSamplerConfig({ name: text, data: currentConfig.data })
                }}
            />

            <HeaderTitle title="Samplers" />
            <HeaderButton headerRight={headerRight} />

            <DropdownSheet
                containerStyle={{ marginHorizontal: spacing.xl, paddingVertical: spacing.m }}
                selected={currentConfig}
                data={configList}
                onChangeValue={(item) => {
                    if (item.name === currentConfig.name) return
                    changeConfig(configList.indexOf(item))
                }}
                labelExtractor={(item) => item.name}
            />

            <KeyboardAwareScrollView contentContainerStyle={styles.scrollContainer}>
                {currentConfig &&
                    getSamplerList().map((item, index) => {
                        const samplerItem = Samplers?.[item.samplerID]
                        if (!samplerItem)
                            return (
                                <Text style={styles.unsupported}>
                                    Sampler ID {`[${item.samplerID}]`} Not Supported
                                </Text>
                            )
                        switch (samplerItem.inputType) {
                            case 'slider':
                                return (
                                    (samplerItem.values.type === 'float' ||
                                        samplerItem.values.type === 'integer') && (
                                        <ThemedSlider
                                            key={item.samplerID}
                                            value={
                                                currentConfig.data[samplerItem.internalID] as number
                                            }
                                            onValueChange={(value) => {
                                                updateCurrentConfig({
                                                    ...currentConfig,
                                                    data: {
                                                        ...currentConfig.data,
                                                        [samplerItem.internalID]: value,
                                                    },
                                                })
                                            }}
                                            label={samplerItem.friendlyName}
                                            min={samplerItem.values.min}
                                            max={samplerItem.values.max}
                                            step={samplerItem.values.step}
                                            precision={samplerItem.values.precision ?? 2}
                                        />
                                    )
                                )
                            case 'checkbox':
                                return (
                                    <ThemedCheckbox
                                        value={currentConfig.data[item.samplerID] as boolean}
                                        key={item.samplerID}
                                        onChangeValue={(b) => {
                                            updateCurrentConfig({
                                                ...currentConfig,
                                                data: {
                                                    ...currentConfig.data,
                                                    [samplerItem.internalID]: b,
                                                },
                                            })
                                        }}
                                        label={samplerItem.friendlyName}
                                    />
                                )
                            case 'textinput':
                                return (
                                    <View key={item.samplerID}>
                                        <ThemedTextInput
                                            value={currentConfig.data[item.samplerID] as string}
                                            onChangeText={(text) => {
                                                updateCurrentConfig({
                                                    ...currentConfig,
                                                    data: {
                                                        ...currentConfig.data,
                                                        [item.samplerID]: text,
                                                    },
                                                })
                                            }}
                                            label={samplerItem.friendlyName}
                                            multiline={item.samplerID === 'grammar_string'}
                                            numberOfLines={item.samplerID === 'grammar_string' ? 8 : 1}
                                        />
                                        {item.samplerID === 'grammar_string' && (
                                            <View style={{ 
                                                flexDirection: 'row', 
                                                marginTop: spacing.m, 
                                                columnGap: spacing.m,
                                                flexWrap: 'wrap'
                                            }}>
                                                <View style={{ 
                                                    flexDirection: 'row', 
                                                    columnGap: spacing.m,
                                                    flex: 1,
                                                    minWidth: '100%',
                                                    marginBottom: spacing.s
                                                }}>
                                                    <ThemedButton
                                                        label="Upload GBNF"
                                                        iconName="upload"
                                                        variant="secondary"
                                                        onPress={handleUploadGBNF}
                                                        buttonStyle={{ flex: 1 }}
                                                    />
                                                    <ThemedButton
                                                        label="Upload JSON"
                                                        iconName="upload"
                                                        variant="secondary" 
                                                        onPress={handleUploadJSON}
                                                        buttonStyle={{ flex: 1 }}
                                                    />
                                                </View>
                                                <View style={{ 
                                                    flexDirection: 'row', 
                                                    columnGap: spacing.m,
                                                    flex: 1,
                                                    minWidth: '100%'
                                                }}>
                                                    <ThemedButton
                                                        label="Upload LARK"
                                                        iconName="upload"
                                                        variant="primary"
                                                        onPress={handleUploadLARK}
                                                        buttonStyle={{ flex: 1 }}
                                                    />
                                                    <ThemedButton
                                                        label="Validate"
                                                        iconName="check"
                                                        variant="tertiary"
                                                        onPress={() => {
                                                            const grammarContent = currentConfig.data.grammar_string as string
                                                            if (!grammarContent) {
                                                                Logger.warnToast('No grammar content to validate')
                                                                return
                                                            }
                                                            
                                                            // Auto-detect grammar type and validate
                                                            let validation
                                                            if (grammarContent.includes('::=')) {
                                                                validation = validateGBNF(grammarContent)
                                                            } else {
                                                                try {
                                                                    const schema = JSON.parse(grammarContent)
                                                                    validation = validateJsonSchema(schema)
                                                                } catch {
                                                                    validation = { valid: false, errors: ['Unable to parse as JSON Schema or GBNF'] }
                                                                }
                                                            }
                                                            
                                                            if (validation.valid) {
                                                                Logger.infoToast('✅ Grammar validation passed!')
                                                            } else {
                                                                Alert.alert({
                                                                    title: 'Grammar Validation',
                                                                    description: `❌ Validation failed:\n\n${validation.errors.slice(0, 3).join('\n')}${validation.errors.length > 3 ? '\n\n...and more' : ''}`,
                                                                    buttons: [{ label: 'OK' }]
                                                                })
                                                            }
                                                        }}
                                                        buttonStyle={{ flex: 1 }}
                                                    />
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )
                            //case 'custom':
                            default:
                                return (
                                    <Text style={styles.warningText}>Invalid Sampler Field!</Text>
                                )
                        }
                    })}
            </KeyboardAwareScrollView>
        </SafeAreaView>
    )
}

export default SamplerMenu

const useStyles = () => {
    const { color, spacing } = Theme.useTheme()
    return StyleSheet.create({
        scrollContainer: {
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.xl2,
            rowGap: spacing.xl,
        },

        dropdownContainer: {
            marginHorizontal: spacing.xl,
        },

        button: {
            padding: spacing.s,
            borderRadius: spacing.s,
            marginLeft: spacing.m,
        },

        warningText: {
            color: color.text._100,
            backgroundColor: color.error._500,
            padding: spacing.m,
            margin: spacing.xl,
            borderRadius: spacing.m,
        },

        unsupported: {
            color: color.text._400,
            textAlign: 'center',
            paddingVertical: spacing.m,
            marginVertical: spacing.m,
            borderRadius: spacing.m,
            backgroundColor: color.neutral._300,
        },
    })
}
