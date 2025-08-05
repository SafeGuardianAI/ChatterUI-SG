import ThemedButton from '@components/buttons/ThemedButton'
import SectionTitle from '@components/text/SectionTitle'
import TText from '@components/text/TText'
import Alert from '@components/views/Alert'
import ThemedCheckbox from '@components/input/ThemedCheckbox'
import Accordion from '@components/views/Accordion'

import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'
import { useMMKVBoolean } from '@lib/storage/MMKV'
import { RescueAPIService } from '@lib/services/RescueAPI'
import React, { useState, useEffect } from 'react'
import { View, ScrollView, StyleSheet, NativeModules, NativeEventEmitter } from 'react-native'

const { BitChatModule } = NativeModules;

const BitChatSettings = () => {
    const { color, spacing, borderRadius } = Theme.useTheme()
    
    const [meshEnabled, setMeshEnabled] = useMMKVBoolean('bitchat_mesh_enabled', false)
    const [autoConnect, setAutoConnect] = useMMKVBoolean('bitchat_auto_connect', true)
    
    const [isTestingConnection, setIsTestingConnection] = useState(false)
    const [testResults, setTestResults] = useState<string>('')
    const [meshStatus, setMeshStatus] = useState<any>(null)

    const testMeshConnection = async () => {
        setIsTestingConnection(true)
        setTestResults('')
        
        try {
            // Check if BitChat module is available
            if (!BitChatModule) {
                Alert.alert({
                    title: 'BitChat Not Available',
                    description: 'BitChat native module is not available on this device. Mesh networking functionality is disabled.',
                    buttons: [{ label: 'OK' }]
                })
                return
            }

            Logger.info('Starting BitChat mesh service test...')
            
            // Create event emitter for testing
            const BitChatEvents = new NativeEventEmitter(BitChatModule)
            let testPeers: any[] = []
            let messageReceived = false
            
            // Set up test listeners
            const peerListener = BitChatEvents.addListener('onPeerListUpdated', (peerList) => {
                Logger.info(`Test: Peer list updated - ${peerList.length} peers found`)
                testPeers = peerList
            })
            
            const messageListener = BitChatEvents.addListener('onMessageReceived', (message) => {
                Logger.info(`Test: Message received - ${message}`)
                messageReceived = true
            })
            
            try {
                // Start mesh service
                await BitChatModule.startMeshService()
                Logger.info('BitChat mesh service started successfully')
                
                // Wait a bit for peer discovery
                await new Promise(resolve => setTimeout(resolve, 3000))
                
                // Send a test message
                const testMessage = `BitChat Test Message - ${new Date().toISOString()}`
                await BitChatModule.sendPublicMessage(testMessage)
                Logger.info('Test message sent successfully')
                
                // Wait a bit more for any responses
                await new Promise(resolve => setTimeout(resolve, 2000))
                
                // Clean up listeners
                peerListener.remove()
                messageListener.remove()
                
                // Prepare results
                let results = `✅ BitChat Test Results:\n\n`
                results += `🔧 Native Module: Available\n`
                results += `🌐 Mesh Service: Started Successfully\n`
                results += `👥 Peers Discovered: ${testPeers.length}\n`
                results += `📡 Test Message: Sent\n`
                results += `📥 Messages Received: ${messageReceived ? 'Yes' : 'None during test'}\n\n`
                
                if (testPeers.length > 0) {
                    results += `Connected Peers:\n${testPeers.map((peer, index) => `${index + 1}. ${peer.name || peer.id || 'Unknown'}`).join('\n')}\n\n`
                } else {
                    results += `⚠️ No peers discovered during test. This is normal if no other BitChat devices are nearby.\n\n`
                }
                
                results += `📱 Mesh networking is fully functional!`
                
                Alert.alert({
                    title: 'BitChat Test Complete',
                    description: results,
                    buttons: [{ label: 'OK' }]
                })
                
                // Optional: Stop the service after test
                // await BitChatModule.stopMeshService()
                
            } catch (serviceError) {
                peerListener.remove()
                messageListener.remove()
                throw serviceError
            }
            
        } catch (error) {
            Logger.error(`BitChat test failed: ${error}`)
            Alert.alert({
                title: 'BitChat Test Failed',
                description: `Failed to test BitChat mesh networking:\n\n${error}\n\nPlease check:\n- Device permissions are granted\n- WiFi/Bluetooth are enabled\n- Location services are enabled\n- No conflicting mesh services running`,
                buttons: [{ label: 'OK' }]
            })
        } finally {
            setIsTestingConnection(false)
        }
    }

    const sendTestBroadcast = async () => {
        if (!BitChatModule) {
            Logger.errorToast('BitChat module not available')
            return
        }
        
        try {
            const testMessage = `BitChat Broadcast Test - ${new Date().toLocaleTimeString()}`
            await BitChatModule.sendPublicMessage(testMessage)
            Logger.infoToast('Test broadcast sent successfully')
        } catch (error) {
            Logger.errorToast(`Broadcast failed: ${error}`)
        }
    }

    const restartMeshService = async () => {
        if (!BitChatModule) {
            Logger.errorToast('BitChat module not available')
            return
        }
        
        try {
            await BitChatModule.stopMeshService()
            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
            await BitChatModule.startMeshService()
            Logger.infoToast('Mesh service restarted successfully')
        } catch (error) {
            Logger.errorToast(`Failed to restart mesh service: ${error}`)
        }
    }

    const handleMeshToggle = async (value: boolean) => {
        setMeshEnabled(value)
        
        // Update rescue API mesh relay
        try {
            const rescueAPI = RescueAPIService.getInstance()
            await rescueAPI.setMeshRelayEnabled(value)
            
            if (value) {
                Logger.infoToast('BitChat mesh networking enabled')
                // Update mesh status
                updateMeshStatus()
            } else {
                Logger.infoToast('BitChat mesh networking disabled')
                setMeshStatus(null)
            }
        } catch (error) {
            Logger.errorToast(`Failed to ${value ? 'enable' : 'disable'} mesh relay: ${error}`)
        }
    }

    const updateMeshStatus = () => {
        try {
            const rescueAPI = RescueAPIService.getInstance()
            const status = rescueAPI.getMeshNetworkStatus()
            setMeshStatus(status)
        } catch (error) {
            Logger.error(`Failed to get mesh status: ${error}`)
        }
    }

    useEffect(() => {
        if (meshEnabled) {
            updateMeshStatus()
            // Update status every 10 seconds
            const interval = setInterval(updateMeshStatus, 10000)
            return () => clearInterval(interval)
        }
    }, [meshEnabled])

    const handleAutoConnectToggle = (value: boolean) => {
        setAutoConnect(value)
        if (value) {
            Logger.infoToast('Auto-connect enabled')
        } else {
            Logger.infoToast('Auto-connect disabled')
        }
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
        buttonContainer: {
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.m,
            flexWrap: 'wrap',
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
        },
        statusContainer: {
            backgroundColor: BitChatModule ? color.primary._200 : color.error._200,
            padding: spacing.sm,
            borderRadius: borderRadius.s,
            marginTop: spacing.m,
        },
        statusText: {
            color: BitChatModule ? color.primary._800 : color.error._800,
            fontWeight: '600',
        }
    })

    return (
        <View style={styles.section}>
            <SectionTitle>BitChat Mesh Networking</SectionTitle>
            
            <View style={styles.checkboxContainer}>
                <TText>Enable Mesh Networking</TText>
                <ThemedCheckbox value={meshEnabled} onChangeValue={handleMeshToggle} />
            </View>
            <TText style={styles.infoText}>
                Enable peer-to-peer mesh networking to share conversations with nearby devices without internet.
            </TText>

            {meshEnabled && (
                <>
                    <View style={styles.checkboxContainer}>
                        <TText>Auto-Connect to Peers</TText>
                        <ThemedCheckbox value={autoConnect} onChangeValue={handleAutoConnectToggle} />
                    </View>
                    <TText style={styles.infoText}>
                        Automatically connect to nearby BitChat devices when detected.
                    </TText>

                    <View style={styles.statusContainer}>
                        <TText style={styles.statusText}>
                            {BitChatModule ? '✅ BitChat Module: Available' : '❌ BitChat Module: Not Available'}
                        </TText>
                    </View>

                    {meshStatus && (
                        <View style={[styles.statusContainer, { backgroundColor: color.primary._100 }]}>
                            <TText style={[styles.statusText, { color: color.primary._800 }]}>
                                🌐 Mesh Rescue Relay: {meshStatus.status}
                            </TText>
                            <TText style={[styles.infoText, { marginTop: spacing.xs }]}>
                                Device ID: {meshStatus.deviceId?.substring(0, 12)}...
                            </TText>
                            <TText style={styles.infoText}>
                                👥 Peers: {meshStatus.peerCount} | 📋 Queued: {meshStatus.queuedMessages} | 📡 Relayed: {meshStatus.relayedMessages}
                            </TText>
                            {meshStatus.queue && meshStatus.queue.length > 0 && (
                                <TText style={[styles.infoText, { color: color.error._600 }]}>
                                    ⚠️ {meshStatus.queue.length} messages pending transmission
                                </TText>
                            )}
                        </View>
                    )}

                    <View style={styles.buttonContainer}>
                        <ThemedButton 
                            label={isTestingConnection ? "Testing..." : "Test Mesh Connection"} 
                            onPress={testMeshConnection}
                            disabled={isTestingConnection}
                        />
                        <ThemedButton 
                            label="Send Test Broadcast" 
                            onPress={sendTestBroadcast}
                            variant="secondary"
                        />
                    </View>

                    <View style={styles.buttonContainer}>
                        <ThemedButton 
                            label="Restart Mesh Service" 
                            onPress={restartMeshService}
                            variant="secondary"
                        />
                        {meshStatus && meshStatus.queuedMessages > 0 && (
                            <ThemedButton 
                                label="Retry Queued Messages" 
                                onPress={async () => {
                                    try {
                                        const rescueAPI = RescueAPIService.getInstance()
                                        await rescueAPI.retryQueuedVictimData()
                                        Logger.infoToast('Retrying queued messages...')
                                        updateMeshStatus()
                                    } catch (error) {
                                        Logger.errorToast(`Failed to retry messages: ${error}`)
                                    }
                                }}
                                variant="secondary"
                            />
                        )}
                    </View>

                    <Accordion label="How BitChat Rescue Relay Works">
                        <View style={{ padding: spacing.m }}>
                            <TText>
                                BitChat Rescue Relay provides emergency-grade mesh networking for victim data transmission:
                                {'\n\n'}
                                🌐 <TText style={{ fontWeight: 'bold' }}>Mesh Networking:</TText>
                                {'\n'}- Creates local network between devices
                                {'\n'}- Works without internet connection
                                {'\n'}- Uses WiFi Direct, Bluetooth, and nearby protocols
                                {'\n\n'}
                                🚑 <TText style={{ fontWeight: 'bold' }}>Rescue Data Relay:</TText>
                                {'\n'}- Automatically queues victim data when offline
                                {'\n'}- Prioritizes critical/serious cases first
                                {'\n'}- Relays through mesh to internet-connected devices
                                {'\n'}- Persistent queue with retry mechanisms
                                {'\n\n'}
                                📊 <TText style={{ fontWeight: 'bold' }}>Priority System:</TText>
                                {'\n'}- CRITICAL: Life-threatening (trapped, severe injuries)
                                {'\n'}- SERIOUS: Urgent but stable
                                {'\n'}- HIGH: Important updates
                                {'\n'}- NORMAL: Standard reports
                                {'\n\n'}
                                📡 <TText style={{ fontWeight: 'bold' }}>Message Types:</TText>
                                {'\n'}- EMERGENCY: Critical alerts (highest priority)
                                {'\n'}- DATA: Victim information relay
                                {'\n'}- BEACON: Status broadcasts every 30s
                                {'\n'}- ACK: Delivery confirmations
                                {'\n\n'}
                                🔒 <TText style={{ fontWeight: 'bold' }}>Reliability:</TText>
                                {'\n'}- Exponential backoff retry (up to 10 attempts)
                                {'\n'}- Message expiration (24h critical, 6h others)
                                {'\n'}- Automatic internet fallback detection
                                {'\n'}- Persistent storage survives app restarts
                                {'\n\n'}
                                ⚙️ <TText style={{ fontWeight: 'bold' }}>Requirements:</TText>
                                {'\n'}- WiFi and Bluetooth permissions
                                {'\n'}- Location services (for nearby device discovery)
                                {'\n'}- Multiple BitChat-enabled devices in range
                                {'\n'}- At least one device with internet access in mesh
                            </TText>
                        </View>
                    </Accordion>

                    {!BitChatModule && (
                        <View style={styles.warningContainer}>
                            <TText style={styles.warningText}>
                                ⚠️ BitChatNative module is not available on this device.
                                {'\n\n'}
                                🔧 <TText style={{ fontWeight: 'bold' }}>Fallback Mode Active:</TText>
                                {'\n'}✅ Full AI functionality for victim data generation
                                {'\n'}✅ Direct API submission when internet is available
                                {'\n'}✅ Local data storage and queue management
                                {'\n'}❌ Mesh networking disabled (requires native module)
                                {'\n'}❌ Offline relay functionality unavailable
                                {'\n\n'}
                                🏗️ <TText style={{ fontWeight: 'bold' }}>To Enable Full Mesh Capabilities:</TText>
                                {'\n'}1. Build with Android NDK support
                                {'\n'}2. Include BitChatNative module in build
                                {'\n'}3. Grant all required permissions
                                {'\n\n'}
                                📖 See README.md for detailed build instructions.
                            </TText>
                        </View>
                    )}
                </>
            )}
        </View>
    )
}

export default BitChatSettings