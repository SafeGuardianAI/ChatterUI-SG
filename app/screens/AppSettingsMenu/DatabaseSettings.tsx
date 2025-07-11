import ThemedButton from '@components/buttons/ThemedButton'
import SectionTitle from '@components/text/SectionTitle'
import Alert from '@components/views/Alert'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { Theme } from '@lib/theme/ThemeManager'
import { localDownload } from '@vali98/react-native-fs'
import appConfig from 'app.config'
import { convertJsonSchemaToGrammar } from 'cui-llama.rn'
import { setStringAsync } from 'expo-clipboard'
import { reloadAppAsync } from 'expo'
import { getDocumentAsync } from 'expo-document-picker'
import { copyAsync, deleteAsync, documentDirectory, readAsStringAsync } from 'expo-file-system'
import React from 'react'
import { Text, View } from 'react-native'

const appVersion = appConfig.expo.version

const exportDB = async (notify: boolean = true) => {
    await localDownload(`${documentDirectory}/SQLite/db.db`.replace('file://', ''))
        .then(() => {
            if (notify) Logger.infoToast('Download Successful!')
        })
        .catch((e: string) => Logger.errorToast('Failed to copy database: ' + e))
}

const importDB = async (uri: string, name: string) => {
    const copyDB = async () => {
        await exportDB(false)
        await deleteAsync(`${documentDirectory}SQLite/db.db`).catch(() => {
            Logger.debug('Somehow the db is already deleted')
        })
        await copyAsync({
            from: uri,
            to: `${documentDirectory}SQLite/db.db`,
        })
            .then(() => {
                Logger.info('Copy Successful, Restarting now.')
                reloadAppAsync()
            })
            .catch((e) => {
                Logger.errorToast(`Failed to import database: ${e}`)
            })
    }

    const dbAppVersion = name.split('-')?.[0]
    if (dbAppVersion !== appVersion) {
        Alert.alert({
            title: `WARNING: Different Version`,
            description: `The imported database file has a different app version (${dbAppVersion}) to installed version (${appVersion}).\n\nImporting this database may break or corrupt the database. It is recommended to use the same app version.`,
            buttons: [
                { label: 'Cancel' },
                { label: 'Import Anyways', onPress: copyDB, type: 'warning' },
            ],
        })
    } else copyDB()
}

const applyGrammarToSampler = (grammar: string, fileName: string) => {
    const state = SamplersManager.useSamplerState.getState()
    const currentConfig = state.configList[state.currentConfigIndex]
    
    if (!currentConfig) {
        Logger.errorToast('No sampler configuration found')
        return
    }

    const updatedConfig = {
        ...currentConfig,
        data: {
            ...currentConfig.data,
            grammar_string: grammar,
        },
    }

    state.updateCurrentConfig(updatedConfig)
    Logger.infoToast(`Grammar from "${fileName}" applied to current sampler configuration`)
}

const uploadCustomFile = async () => {
    try {
        const result = await getDocumentAsync({ 
            type: ['application/*'],
            copyToCacheDirectory: true 
        })
        
        if (result.canceled) return
        
        const file = result.assets[0]
        const fileName = file.name.toLowerCase()
        
        // Validate file extension
        const supportedExtensions = ['.gbnf', '.lark', '.json']
        const isValidExtension = supportedExtensions.some(ext => fileName.endsWith(ext))
        
        if (!isValidExtension) {
            Logger.errorToast(`Invalid file type. Supported formats: ${supportedExtensions.join(', ')}`)
            return
        }
        
        // Read file content
        const fileContent = await readAsStringAsync(file.uri)
        
        // Process based on file type
        if (fileName.endsWith('.json')) {
            try {
                const jsonData = JSON.parse(fileContent)
                Logger.infoToast('JSON file uploaded successfully!')
                Logger.info(`JSON file processed: ${file.name}`)
                
                // Generate grammar from JSON schema
                try {
                    const generatedGrammar = await convertJsonSchemaToGrammar(jsonData)
                    Logger.info('Grammar generated successfully from JSON schema')
                    
                    // Show options for what to do with the grammar
                    Alert.alert({
                        title: 'Grammar Generated',
                        description: `Grammar has been generated from your JSON schema.\n\nWhat would you like to do with it?`,
                        buttons: [
                            { label: 'View Grammar', onPress: () => {
                                Alert.alert({
                                    title: 'Generated Grammar',
                                    description: generatedGrammar,
                                    buttons: [
                                        { label: 'Copy to Clipboard', onPress: () => {
                                            setStringAsync(generatedGrammar)
                                            Logger.infoToast('Grammar copied to clipboard')
                                        }},
                                        { label: 'Apply to Sampler', onPress: () => {
                                            applyGrammarToSampler(generatedGrammar, file.name)
                                        }},
                                        { label: 'Close' }
                                    ]
                                })
                            }},
                            { label: 'Apply to Sampler', onPress: () => {
                                applyGrammarToSampler(generatedGrammar, file.name)
                            }},
                            { label: 'Cancel' }
                        ],
                    })
                } catch (grammarError) {
                    Logger.errorToast(`Failed to generate grammar: ${grammarError}`)
                    Logger.info('Proceeding with regular JSON processing')
                }
                
                console.log('JSON data:', jsonData)
            } catch (e) {
                Logger.errorToast('Invalid JSON file format')
                return
            }
        } else if (fileName.endsWith('.gbnf')) {
            // GBNF files are already grammar files
            Logger.infoToast('GBNF file uploaded successfully!')
            Logger.info(`GBNF file processed: ${file.name}`)
            
            Alert.alert({
                title: 'GBNF Grammar File',
                description: `GBNF grammar file loaded.\n\nWould you like to apply it to your current sampler configuration?`,
                buttons: [
                    { label: 'Cancel' },
                    { label: 'Apply to Sampler', onPress: () => {
                        applyGrammarToSampler(fileContent, file.name)
                    }},
                ],
            })
            
            console.log('GBNF content:', fileContent)
        } else if (fileName.endsWith('.lark')) {
            // Lark files are also grammar files (different format)
            Logger.infoToast('Lark file uploaded successfully!')
            Logger.info(`Lark file processed: ${file.name}`)
            
            Alert.alert({
                title: 'Lark Grammar File',
                description: `Lark grammar file loaded.\n\nWould you like to apply it to your current sampler configuration?`,
                buttons: [
                    { label: 'Cancel' },
                    { label: 'Apply to Sampler', onPress: () => {
                        applyGrammarToSampler(fileContent, file.name)
                    }},
                ],
            })
            
            console.log('Lark content:', fileContent)
        }
        
    } catch (error) {
        Logger.errorToast(`Failed to upload file: ${error}`)
    }
}

const DatabaseSettings = () => {
    const { color, spacing } = Theme.useTheme()
    return (
        <View style={{ rowGap: 8 }}>
            <SectionTitle>Database Management</SectionTitle>

            <Text
                style={{
                    color: color.text._500,
                    paddingBottom: spacing.xs,
                    marginBottom: spacing.m,
                }}>
                WARNING: only import if you are certain it's from the same version!
            </Text>
            <ThemedButton
                label="Export Database"
                variant="secondary"
                onPress={() => {
                    Alert.alert({
                        title: `Export Database`,
                        description: `Are you sure you want to export the database file?\n\nIt will automatically be downloaded to Downloads`,
                        buttons: [
                            { label: 'Cancel' },
                            { label: 'Export Database', onPress: exportDB },
                        ],
                    })
                }}
            />

            <ThemedButton
                label="Import Database"
                variant="secondary"
                onPress={async () => {
                    getDocumentAsync({ type: ['application/*'] }).then(async (result) => {
                        if (result.canceled) return
                        Alert.alert({
                            title: `Import Database`,
                            description: `Are you sure you want to import this database? This may will destroy the current database!\n\nA backup will automatically be downloaded.\n\nApp will restart automatically`,
                            buttons: [
                                { label: 'Cancel' },
                                {
                                    label: 'Import',
                                    onPress: () =>
                                        importDB(result.assets[0].uri, result.assets[0].name),
                                    type: 'warning',
                                },
                            ],
                        })
                    })
                }}
            />

            <SectionTitle>Grammar & File Processing</SectionTitle>
            
            <Text
                style={{
                    color: color.text._500,
                    paddingBottom: spacing.xs,
                    marginBottom: spacing.m,
                }}>
                Upload files to generate grammar or apply existing grammar files:
                {'\n'}• JSON: Generate grammar from JSON schema
                {'\n'}• GBNF: Apply grammar directly to sampler
                {'\n'}• Lark: Apply Lark grammar to sampler
            </Text>
            
            <ThemedButton
                label="Upload & Process File"
                variant="secondary"
                onPress={() => {
                    Alert.alert({
                        title: `Upload & Process File`,
                        description: `Select a file to upload and process:\n\n• JSON files will have grammar generated from their schema\n• GBNF/Lark files will be applied directly as grammar\n\nGenerated grammar can be applied to your current sampler configuration.`,
                        buttons: [
                            { label: 'Cancel' },
                            { label: 'Select File', onPress: uploadCustomFile },
                        ],
                    })
                }}
            />
        </View>
    )
}

export default DatabaseSettings

