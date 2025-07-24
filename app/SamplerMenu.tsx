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
            Logger.infoToast('Opening file picker...')
            
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
            console.log('Attempting to read file:', file.uri)
            
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
            
            // Basic GBNF syntax validation
            const gbnfLines = grammarContent.split('\n')
            for (let i = 0; i < gbnfLines.length; i++) {
                const line = gbnfLines[i].trim()
                if (line && !line.startsWith('#') && line.length > 0) {
                    // Check if it's a rule definition
                    if (!line.includes('::=') && !line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*$/)) {
                        Logger.errorToast(`GBNF syntax warning at line ${i + 1}: May have formatting issues. Check your grammar syntax.`)
                        console.warn(`GBNF line ${i + 1}: "${line}"`)
                        // Don't return, just warn
                    }
                }
            }
            
            Logger.infoToast('Updating grammar configuration...')
            updateCurrentConfig({
                ...currentConfig,
                data: {
                    ...currentConfig.data,
                    grammar_string: grammarContent,
                },
            })
            
            Logger.infoToast(`Successfully loaded GBNF grammar from ${file.name}`)
        } catch (error) {
            console.error('GBNF Upload Error:', error)
            Logger.errorToast(`Failed to load GBNF file: ${(error as Error)?.message || String(error)}`)
        }
    }

    const handleUploadJSON = async () => {
        try {
            Logger.infoToast('Opening JSON file picker...')
            
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
            console.log('Attempting to read JSON file:', file.uri)
            
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
            
            Logger.infoToast('Converting JSON schema to GBNF...')
            
            // Validate JSON schema structure
            if (!jsonSchema || typeof jsonSchema !== 'object') {
                Logger.errorToast('JSON must be a valid object')
                return
            }
            
            if (!jsonSchema.type) {
                Logger.errorToast('JSON schema must have a "type" property (e.g., "object", "array", "string")')
                return
            }
            
            let grammarContent
            try {
                grammarContent = convertJsonSchemaToGrammar(jsonSchema)
            } catch (conversionError) {
                console.error('JSON to GBNF conversion error:', conversionError)
                const errorMsg = (conversionError as Error)?.message || String(conversionError)
                
                if (errorMsg.includes('type')) {
                    Logger.errorToast('Invalid JSON schema: Missing or invalid "type" property. Use "object", "array", "string", "number", "boolean", etc.')
                } else {
                    Logger.errorToast(`Conversion failed: ${errorMsg}`)
                }
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
            
            Logger.infoToast(`Successfully converted and loaded grammar from ${file.name}`)
        } catch (error) {
            console.error('JSON Upload Error:', error)
            Logger.errorToast(`Failed to process JSON file: ${(error as Error)?.message || String(error)}`)
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
                                                columnGap: spacing.m 
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
