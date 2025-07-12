import ThemedButton from '@components/buttons/ThemedButton'
import SectionTitle from '@components/text/SectionTitle'
import TText from '@components/text/TText'
import Alert from '@components/views/Alert'
import ThemedTextInput from '@components/input/ThemedTextInput'
import Accordion from '@components/views/Accordion'
import ThemedCheckbox from '@components/input/ThemedCheckbox'
import { RescueAPIService, RescueAPISettings, BackendType } from '@lib/services/RescueAPI'
import { mmkv } from '@lib/storage/MMKV'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'
import React, { useState, useEffect } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { SamplersManager } from '@lib/state/SamplerState'
import { VICTIM_SCHEMA_GRAMMAR, VICTIM_SCHEMA_DESCRIPTION, SIMPLE_VICTIM_GRAMMAR } from '@lib/constants/VictimGrammar'
import { getDocumentAsync } from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'

const GRAMMAR_CACHE_KEY = 'cached_grammar_content'

const RescueAPISettingsMenu = () => {
    const { color, spacing, borderRadius } = Theme.useTheme()
    const [enabled, setEnabled] = useState(mmkv.getBoolean(RescueAPISettings.Enabled) ?? false)
    const [firebaseEnabled, setFirebaseEnabled] = useState(mmkv.getBoolean(RescueAPISettings.FirebaseEnabled) ?? false)
    const [mongodbEnabled, setMongodbEnabled] = useState(mmkv.getBoolean(RescueAPISettings.MongoDBEnabled) ?? true)
    const [endpoint, setEndpoint] = useState(mmkv.getString(RescueAPISettings.Endpoint) ?? '')
    const [autoReport, setAutoReport] = useState(mmkv.getBoolean(RescueAPISettings.AutoReport) ?? true)
    const [lastVictimNumber, setLastVictimNumber] = useState(mmkv.getString(RescueAPISettings.LastVictimNumber) ?? '')
    const [customGrammarPath, setCustomGrammarPath] = useState(mmkv.getString('rescue_api_custom_grammar_path') ?? '')

    useEffect(() => {
        // Initialize the rescue API if enabled
        if (enabled) {
            RescueAPIService.getInstance(endpoint).initialize().catch(error => {
                Logger.error(`Failed to initialize Rescue API: ${error}`)
            })
        }
    }, [enabled, endpoint])

    const handleToggleEnabled = (value: boolean) => {
        setEnabled(value)
        mmkv.set(RescueAPISettings.Enabled, value)
        
        if (value) {
            // Ensure at least one backend is enabled
            if (!firebaseEnabled && !mongodbEnabled) {
                setMongodbEnabled(true)
                mmkv.set(RescueAPISettings.MongoDBEnabled, true)
            }
            
            Logger.infoToast('Rescue API enabled')
            
            // Check if there's already a grammar loaded
            const state = SamplersManager.useSamplerState.getState()
            const currentConfig = state.configList[state.currentConfigIndex]
            const hasExistingGrammar = currentConfig?.data?.grammar_string && String(currentConfig.data.grammar_string).trim().length > 0
            
            // If no grammar is loaded, automatically load the victim grammar
            if (!hasExistingGrammar) {
                Logger.info('No grammar loaded, automatically loading victim schema')
                
                if (currentConfig) {
                    const updatedConfig = {
                        ...currentConfig,
                        data: {
                            ...currentConfig.data,
                            grammar_string: VICTIM_SCHEMA_GRAMMAR,
                        },
                    }
                    
                    state.updateCurrentConfig(updatedConfig)
                    // Cache the grammar for toggle
                    mmkv.set(GRAMMAR_CACHE_KEY, VICTIM_SCHEMA_GRAMMAR)
                    Logger.infoToast('Victim grammar loaded automatically')
                }
            } else {
                // Grammar already exists, ask if they want to replace it
                Alert.alert({
                    title: 'Grammar Already Loaded',
                    description: 'There is already a grammar loaded. Would you like to replace it with the victim data grammar template?',
                    buttons: [
                        { label: 'Keep Current' },
                        {
                            label: 'Load Victim Grammar',
                            onPress: () => {
                                if (currentConfig) {
                                    const updatedConfig = {
                                        ...currentConfig,
                                        data: {
                                            ...currentConfig.data,
                                            grammar_string: VICTIM_SCHEMA_GRAMMAR,
                                        },
                                    }
                                    
                                    state.updateCurrentConfig(updatedConfig)
                                    // Cache the grammar for toggle
                                    mmkv.set(GRAMMAR_CACHE_KEY, VICTIM_SCHEMA_GRAMMAR)
                                    Logger.infoToast('Victim grammar loaded successfully')
                                }
                            },
                            type: 'default'
                        }
                    ]
                })
            }
        } else {
            Logger.infoToast('Rescue API disabled')
        }
    }

    const handleFirebaseToggle = (value: boolean) => {
        setFirebaseEnabled(value)
        mmkv.set(RescueAPISettings.FirebaseEnabled, value)
        
        if (value) {
            Logger.infoToast('Firebase backend enabled')
            // Disable MongoDB if Firebase is enabled
            if (mongodbEnabled) {
                setMongodbEnabled(false)
                mmkv.set(RescueAPISettings.MongoDBEnabled, false)
            }
        } else if (!mongodbEnabled) {
            // Ensure at least one backend is enabled
            setMongodbEnabled(true)
            mmkv.set(RescueAPISettings.MongoDBEnabled, true)
            Logger.infoToast('MongoDB backend enabled (at least one backend required)')
        }
    }

    const handleMongoDBToggle = (value: boolean) => {
        setMongodbEnabled(value)
        mmkv.set(RescueAPISettings.MongoDBEnabled, value)
        
        if (value) {
            Logger.infoToast('MongoDB backend enabled')
            // Disable Firebase if MongoDB is enabled
            if (firebaseEnabled) {
                setFirebaseEnabled(false)
                mmkv.set(RescueAPISettings.FirebaseEnabled, false)
            }
        } else if (!firebaseEnabled) {
            // Ensure at least one backend is enabled
            setFirebaseEnabled(true)
            mmkv.set(RescueAPISettings.FirebaseEnabled, true)
            Logger.infoToast('Firebase backend enabled (at least one backend required)')
        }
    }

    const handleEndpointChange = (value: string) => {
        setEndpoint(value)
        mmkv.set(RescueAPISettings.Endpoint, value)
    }

    const handleAutoReportToggle = (value: boolean) => {
        setAutoReport(value)
        mmkv.set(RescueAPISettings.AutoReport, value)
    }

    const testConnection = async () => {
        try {
            const backend = firebaseEnabled ? 'Firebase' : 'MongoDB'
            Logger.info(`[${backend}] Starting connection test...`)
            const api = RescueAPIService.getInstance(endpoint)
            await api.initialize()
            
            // Test by fetching all victims
            const result = await api.getAllVictims()
            
            let message = ''
            if (Array.isArray(result)) {
                message = `Successfully connected to ${backend}!\n\nDatabase contains ${result.length} victim record(s).`
                
                // Show recent victim IDs if any exist and check ID format
                if (result.length > 0) {
                    const idField = backend === 'MongoDB' ? '_id' : 'id'
                    const recentVictims = result.slice(-3)
                    const ids = recentVictims.map(v => v[idField] || v._id || v.id || 'Unknown ID')
                    
                    // Check if IDs match expected format
                    let idMismatch = false
                    ids.forEach(id => {
                        if (backend === 'MongoDB' && typeof id === 'string' && id.startsWith('-')) {
                            idMismatch = true
                        } else if (backend === 'Firebase' && typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) {
                            idMismatch = true
                        }
                    })
                    
                    message += `\n\nRecent victim IDs:\n${ids.join('\n')}`
                    
                    if (idMismatch) {
                        message += '\n\n⚠️ WARNING: ID format mismatch detected!\n'
                        if (backend === 'MongoDB') {
                            message += 'Database contains Firebase-style IDs but MongoDB is selected.\n'
                            message += 'Backend should generate ObjectIds for MongoDB.'
                        } else {
                            message += 'Database contains MongoDB ObjectIds but Firebase is selected.\n'
                            message += 'Backend should generate Firebase push IDs.'
                        }
                    }
                }
            } else if (result && typeof result === 'object' && Object.keys(result).length === 0) {
                message = `Successfully connected to ${backend}!\n\nDatabase is empty (no victims found).`
            } else {
                message = 'Connection test completed but received unexpected response format.'
            }
            
            Alert.alert({
                title: `${backend} Connection Test`,
                description: message,
                buttons: [{ label: 'OK' }]
            })
        } catch (error) {
            const backend = firebaseEnabled ? 'Firebase' : 'MongoDB'
            Alert.alert({
                title: `${backend} Connection Error`,
                description: `Failed to connect to ${backend}:\n\n${error}\n\nPlease check:\n- API endpoint is correct\n- Backend server is running\n- ${backend} connection is configured`,
                buttons: [{ label: 'OK' }]
            })
        }
    }

    const showGrammarInfo = () => {
        Alert.alert({
            title: 'Rescue API Grammar (victim_schema.gbnf)',
            description: VICTIM_SCHEMA_DESCRIPTION + '\n\nThis is the default grammar loaded from assets/grammars/victim_schema.gbnf',
            buttons: [
                { label: 'OK' },
                {
                    label: 'Load Grammar',
                    onPress: () => {
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
                            // Cache the grammar for toggle
                            mmkv.set(GRAMMAR_CACHE_KEY, VICTIM_SCHEMA_GRAMMAR)
                            Logger.infoToast('Default victim grammar loaded successfully')
                        }
                    },
                    type: 'default'
                }
            ]
        })
    }

    const clearLastVictim = () => {
        Alert.alert({
            title: 'Create New Victim',
            description: 'This will start tracking a new victim. The next report will create a new victim record instead of updating the existing one. Continue?',
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Create New',
                    onPress: () => {
                        mmkv.delete(RescueAPISettings.LastVictimNumber)
                        setLastVictimNumber('')
                        Logger.infoToast('Ready to create new victim')
                    },
                    type: 'warning'
                }
            ]
        })
    }

    const loadVictimGrammar = () => {
        const state = SamplersManager.useSamplerState.getState()
        const currentConfig = state.configList[state.currentConfigIndex]
        
        if (currentConfig) {
            Alert.alert({
                title: 'Load Default Victim Grammar',
                description: 'This will replace your current grammar settings with the default victim_schema.gbnf template. This grammar enforces the complete victim data structure. Continue?',
                buttons: [
                    { label: 'Cancel' },
                    {
                        label: 'Load',
                        onPress: () => {
                            const updatedConfig = {
                                ...currentConfig,
                                data: {
                                    ...currentConfig.data,
                                    grammar_string: VICTIM_SCHEMA_GRAMMAR,
                                },
                            }
                            
                            state.updateCurrentConfig(updatedConfig)
                            // Cache the grammar for toggle
                            mmkv.set(GRAMMAR_CACHE_KEY, VICTIM_SCHEMA_GRAMMAR)
                            Logger.infoToast('Default victim grammar (victim_schema.gbnf) loaded successfully')
                        },
                        type: 'default'
                    }
                ]
            })
        }
    }

    const loadSimpleTestGrammar = () => {
        const state = SamplersManager.useSamplerState.getState()
        const currentConfig = state.configList[state.currentConfigIndex]
        
        if (currentConfig) {
            Alert.alert({
                title: 'Load Simple Test Grammar',
                description: 'This will load a simple JSON grammar for testing. It allows any valid JSON structure without strict schema requirements. Continue?',
                buttons: [
                    { label: 'Cancel' },
                    {
                        label: 'Load',
                        onPress: () => {
                            const updatedConfig = {
                                ...currentConfig,
                                data: {
                                    ...currentConfig.data,
                                    grammar_string: SIMPLE_VICTIM_GRAMMAR,
                                },
                            }
                            
                            state.updateCurrentConfig(updatedConfig)
                            // Cache the grammar for toggle
                            mmkv.set(GRAMMAR_CACHE_KEY, SIMPLE_VICTIM_GRAMMAR)
                            Logger.infoToast('Simple test grammar loaded successfully')
                        },
                        type: 'default'
                    }
                ]
            })
        }
    }

    const createRescuePreset = () => {
        Alert.alert({
            title: 'Create Rescue Preset',
            description: 'This will create a new sampler preset with the victim grammar pre-loaded. You can switch to this preset when you need to generate rescue data.',
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Create',
                    onPress: () => {
                        SamplersManager.createRescueAPISamplerPreset()
                    },
                    type: 'default'
                }
            ]
        })
    }

    const loadCustomGrammarFile = async () => {
        try {
            const result = await getDocumentAsync({
                type: ['text/*', 'application/octet-stream'],
                copyToCacheDirectory: true,
            })

            if (result.canceled || !result.assets[0]) {
                return
            }

            const file = result.assets[0]
            const grammarContent = await FileSystem.readAsStringAsync(file.uri)

            // Validate that it looks like a grammar file
            if (!grammarContent.includes('::=')) {
                Alert.alert({
                    title: 'Invalid Grammar File',
                    description: 'The selected file does not appear to be a valid GBNF grammar file.',
                    buttons: [{ label: 'OK' }]
                })
                return
            }

            // Store the grammar path
            setCustomGrammarPath(file.name)
            mmkv.set('rescue_api_custom_grammar_path', file.name)

            // Apply the grammar
            const state = SamplersManager.useSamplerState.getState()
            const currentConfig = state.configList[state.currentConfigIndex]
            
            if (currentConfig) {
                const updatedConfig = {
                    ...currentConfig,
                    data: {
                        ...currentConfig.data,
                        grammar_string: grammarContent,
                    },
                }
                
                state.updateCurrentConfig(updatedConfig)
                // Cache the grammar for toggle
                mmkv.set(GRAMMAR_CACHE_KEY, grammarContent)
                Logger.infoToast(`Custom grammar loaded: ${file.name}`)
            }
        } catch (error) {
            Logger.errorToast(`Failed to load grammar file: ${error}`)
        }
    }

    const clearCustomGrammar = () => {
        Alert.alert({
            title: 'Clear Custom Grammar',
            description: 'This will remove the custom grammar reference. You can load the default victim grammar or select a new file.',
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Clear',
                    onPress: () => {
                        setCustomGrammarPath('')
                        mmkv.delete('rescue_api_custom_grammar_path')
                        Logger.infoToast('Custom grammar cleared')
                    },
                    type: 'warning'
                }
            ]
        })
    }

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: color.neutral._100,
        },
        section: {
            marginBottom: spacing.m,
            padding: spacing.m,
            backgroundColor: color.neutral._200,
            borderRadius: borderRadius.m,
        },
        inputContainer: {
            marginVertical: spacing.sm,
        },
        buttonContainer: {
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.m,
        },
        checkboxContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: spacing.sm,
        },
        infoText: {
            marginTop: spacing.xs,
            color: color.text._500,
        },
        warningContainer: {
            backgroundColor: color.error._200,
            padding: spacing.sm,
            borderRadius: borderRadius.s,
            marginTop: spacing.m,
        },
        warningText: {
            color: color.error._800,
        }
    })

    return (
        <ScrollView style={styles.container}>
            <View style={{ padding: spacing.l }}>
                <SectionTitle>Rescue API Integration</SectionTitle>
                
                <View style={styles.section}>
                    <View style={styles.checkboxContainer}>
                        <TText>Enable Rescue API</TText>
                        <ThemedCheckbox value={enabled} onChangeValue={handleToggleEnabled} />
                    </View>
                    <TText style={styles.infoText}>
                        When enabled, structured victim data generated by the AI will be sent to the rescue API endpoint.
                    </TText>
                </View>

                {enabled && (
                    <>
                        <View style={styles.section}>
                            <TText>Backend Selection</TText>
                            <TText style={styles.infoText}>
                                Choose which backend to use for storing victim data. MongoDB uses victim_data root with nested structure, while Firebase uses victim_info root with nested structure.
                            </TText>
                            
                            <View style={[styles.checkboxContainer, { marginTop: spacing.m }]}>
                                <TText>MongoDB Backend</TText>
                                <ThemedCheckbox value={mongodbEnabled} onChangeValue={handleMongoDBToggle} />
                            </View>
                            
                            <View style={styles.checkboxContainer}>
                                <TText>Firebase Backend</TText>
                                <ThemedCheckbox value={firebaseEnabled} onChangeValue={handleFirebaseToggle} />
                            </View>
                        </View>

                        <View style={styles.section}>
                            <TText>API Endpoint</TText>
                            <View style={styles.inputContainer}>
                                <ThemedTextInput
                                    value={endpoint}
                                    onChangeText={handleEndpointChange}
                                    placeholder="https://safeguardian-33b94228882a.herokuapp.com/"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                            <ThemedButton label="Test Connection" onPress={testConnection} />
                        </View>

                        <View style={styles.section}>
                            <View style={styles.checkboxContainer}>
                                <TText>Auto Report</TText>
                                <ThemedCheckbox value={autoReport} onChangeValue={handleAutoReportToggle} />
                            </View>
                            <TText style={styles.infoText}>
                                Automatically send victim data when AI generates valid structured information.
                            </TText>
                        </View>

                        {lastVictimNumber && (
                            <View style={styles.section}>
                                <TText>Last Victim Number</TText>
                                <TText style={styles.infoText}>{lastVictimNumber}</TText>
                                <TText style={[styles.infoText, { marginTop: spacing.xs }]}>
                                    The system will update this victim by default. Use the buttons below to control this behavior.
                                </TText>
                                <View style={styles.buttonContainer}>
                                    <ThemedButton label="Create New Victim" onPress={clearLastVictim} />
                                    <ThemedButton 
                                        label="Keep Updating"
                                        onPress={() => {
                                            Logger.infoToast(`Continue updating victim ${lastVictimNumber}`)
                                        }} 
                                        variant="secondary" />
                                </View>
                            </View>
                        )}

                        <View style={styles.section}>
                            <TText>Database Status</TText>
                            {mongodbEnabled ? (
                                <>
                                    <TText style={styles.infoText}>
                                        Backend: MongoDB Atlas
                                    </TText>
                                    <TText style={styles.infoText}>
                                        Database: Cluster0
                                    </TText>
                                    <TText style={styles.infoText}>
                                        Collection: disaster_rescue.rescue_team_dataset
                                    </TText>
                                    <TText style={styles.infoText}>
                                        ID Format: 24-character hex ObjectId
                                    </TText>
                                    <TText style={styles.infoText}>
                                        JSON Structure: Nested with victim_data root (victim_json_template_flat.json)
                                    </TText>
                                </>
                            ) : (
                                <>
                                    <TText style={styles.infoText}>
                                        Backend: Firebase Realtime Database
                                    </TText>
                                    <TText style={styles.infoText}>
                                        Database: SafeGuardian
                                    </TText>
                                    <TText style={styles.infoText}>
                                        Collection: victims
                                    </TText>
                                    <TText style={styles.infoText}>
                                        ID Format: 20-character alphanumeric with - prefix
                                    </TText>
                                    <TText style={styles.infoText}>
                                        JSON Structure: Nested (victim_info hierarchy)
                                    </TText>
                                </>
                            )}
                            <View style={styles.buttonContainer}>
                                <ThemedButton 
                                    label="Check Database"
                                    onPress={async () => {
                                        try {
                                            const api = RescueAPIService.getInstance(endpoint)
                                            const victims = await api.getAllVictims()
                                            if (Array.isArray(victims)) {
                                                const backend = mongodbEnabled ? 'MongoDB' : 'Firebase'
                                                Logger.infoToast(`${backend} has ${victims.length} victim records`)
                                            }
                                        } catch (error) {
                                            Logger.errorToast('Failed to check database')
                                        }
                                    }} 
                                    variant="secondary" />
                                <ThemedButton 
                                    label="Send Test Victim"
                                    onPress={async () => {
                                        try {
                                            const api = RescueAPIService.getInstance(endpoint)
                                            const backend = mongodbEnabled ? 'MongoDB' : 'Firebase'
                                            const testData = mongodbEnabled ? {
                                                // MongoDB uses victim_data root with nested structure
                                                victim_data: {
                                                    emergency_status: "stable",
                                                    personal_info: {
                                                        name: "Test Victim",
                                                        age: 25,
                                                        gender: "male"
                                                    },
                                                    location: {
                                                        lat: 0.0,
                                                        lon: 0.0,
                                                        details: "Test location"
                                                    }
                                                }
                                            } : {
                                                // Firebase uses victim_info root with nested structure
                                                victim_info: {
                                                    personal_info: {
                                                        name: "Test Victim",
                                                        age: 25
                                                    },
                                                    emergency_status: "stable"
                                                }
                                            }
                                            const result = await api.postVictim(testData)
                                            if (result) {
                                                Logger.infoToast(`${backend} test victim created: ${result}`)
                                            } else {
                                                Logger.errorToast(`Failed to create test victim in ${backend}`)
                                            }
                                        } catch (error) {
                                            Logger.errorToast(`Test failed: ${error}`)
                                        }
                                    }} 
                                    variant="secondary" />
                            </View>
                        </View>

                        <View style={styles.section}>
                            <TText>Grammar Management</TText>
                            <TText style={styles.infoText}>
                                The victim data grammar ensures AI generates properly structured rescue information.
                            </TText>
                            
                            {customGrammarPath && (
                                <View style={{ marginTop: spacing.sm }}>
                                    <TText style={{ fontSize: 12, color: color.text._600 }}>
                                        Custom Grammar: {customGrammarPath}
                                    </TText>
                                </View>
                            )}
                            
                            <View style={styles.buttonContainer}>
                                <ThemedButton label="Load Grammar File" onPress={loadCustomGrammarFile} variant="primary" />
                                {customGrammarPath && (
                                    <ThemedButton label="Clear Custom" onPress={clearCustomGrammar} variant="secondary" />
                                )}
                            </View>
                            
                            <View style={styles.buttonContainer}>
                                <ThemedButton label="Load Default Grammar (victim_schema.gbnf)" onPress={loadVictimGrammar} variant="secondary" />
                                <ThemedButton label="View Grammar Info" onPress={showGrammarInfo} variant="secondary" />
                            </View>
                            <View style={styles.buttonContainer}>
                                <ThemedButton label="Load Simple Test Grammar" onPress={loadSimpleTestGrammar} variant="secondary" />
                                <ThemedButton label="Create Rescue Preset" onPress={createRescuePreset} variant="secondary" />
                            </View>
                        </View>

                        <Accordion label="How It Works">
                            <View style={{ padding: spacing.m }}>
                                <TText>
                                    The Rescue API works in conjunction with the grammar feature. When you enable grammar constraints with the victim data template:
                                    {'\n\n'}
                                    1. The AI generates structured victim information in JSON format
                                    {'\n'}2. Valid data is automatically parsed and sent to the rescue endpoint
                                    {'\n'}3. Victim numbers are tracked for updates
                                    {'\n\n'}
                                    <TText style={{ fontWeight: 'bold' }}>Backend Differences:</TText>
                                    {'\n\n'}
                                    <TText style={{ fontWeight: 'bold' }}>MongoDB:</TText>
                                    {'\n'}- Uses victim_data root with nested JSON structure
                                    {'\n'}- Based on victim_json_template_flat.json (despite the name)
                                    {'\n'}- Generates 24-character hex ObjectIds
                                    {'\n'}- Stores in disaster_rescue.rescue_team_dataset collection
                                    {'\n\n'}
                                    <TText style={{ fontWeight: 'bold' }}>Firebase:</TText>
                                    {'\n'}- Uses victim_info root with nested JSON structure
                                    {'\n'}- Generates 20-character alphanumeric IDs with - prefix
                                    {'\n'}- Stores in victims collection
                                    {'\n\n'}
                                    With dual generation mode, conversations remain natural while still producing structured data for rescue coordination.
                                </TText>
                            </View>
                        </Accordion>

                        <View style={styles.warningContainer}>
                            <TText style={styles.warningText}>
                                ⚠️ Important: Ensure that the grammar template is loaded before generating rescue data. The AI must have grammar constraints enabled to produce properly formatted victim information. {mongodbEnabled ? 'MongoDB expects victim_data root with nested JSON structure.' : 'Firebase expects victim_info root with nested JSON structure.'}
                            </TText>
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    )
}

export default RescueAPISettingsMenu 