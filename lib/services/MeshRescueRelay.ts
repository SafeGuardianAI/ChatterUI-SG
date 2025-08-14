import { Logger } from '@lib/state/Logger'
import { mmkvSync } from '@lib/storage/MMKV'
import { NativeModules, NativeEventEmitter } from 'react-native'

const { BitChatModule } = NativeModules

// Message types for mesh rescue communication
export enum MessageType {
    BEACON      = 0x01,  // Periodic status broadcast
    EMERGENCY   = 0x02,  // Critical alert
    ACK         = 0x03,  // Acknowledgment
    ROUTE_REQ   = 0x04,  // Route discovery
    ROUTE_REPLY = 0x05,  // Route response
    DATA        = 0x06,  // Victim data relay
    PING        = 0x07,  // Keep-alive
    TOPOLOGY    = 0x08   // Network map update
}

// Priority levels for message queue
export enum MessagePriority {
    CRITICAL = 1,  // Life-threatening situations
    SERIOUS  = 2,  // Urgent but not immediately life-threatening
    HIGH     = 3,  // Important but stable
    NORMAL   = 4,  // Standard updates
    LOW      = 5   // Background information
}

// Emergency status to priority mapping
const EMERGENCY_PRIORITY_MAP: Record<string, MessagePriority> = {
    'critical': MessagePriority.CRITICAL,
    'serious': MessagePriority.SERIOUS,
    'stable': MessagePriority.HIGH,
    'rescued': MessagePriority.NORMAL,
    'unknown': MessagePriority.NORMAL
}

interface MeshMessage {
    id: string
    type: MessageType
    priority: MessagePriority
    timestamp: number
    victimId: string
    data: any
    attempts: number
    lastAttempt: number
    maxRetries: number
    expiresAt: number
}

interface PeerInfo {
    id: string
    name: string
    isOnline: boolean
    lastSeen: number
    capabilities: string[]
    hasInternetAccess?: boolean
    queuedMessages: number
}

interface NetworkStatus {
    isInitialized: boolean
    deviceId: string
    peerCount: number
    queuedMessages: number
    relayedMessages: number
    lastBeacon: number
    internetAccess: boolean
}

export class MeshRescueRelay {
    private static instance: MeshRescueRelay | null = null
    private isInitialized: boolean = false
    private deviceId: string = ''
    private messageQueue: MeshMessage[] = []
    private peers: Map<string, PeerInfo> = new Map()
    private eventEmitter: NativeEventEmitter | null = null
    private beaconInterval: ReturnType<typeof setInterval> | null = null
    private queueProcessInterval: ReturnType<typeof setInterval> | null = null
    private networkStatus: NetworkStatus
    private messageIdCounter: number = 0

    private constructor() {
        this.networkStatus = {
            isInitialized: false,
            deviceId: '',
            peerCount: 0,
            queuedMessages: 0,
            relayedMessages: 0,
            lastBeacon: 0,
            internetAccess: false
        }
    }

    static getInstance(): MeshRescueRelay {
        if (!MeshRescueRelay.instance) {
            MeshRescueRelay.instance = new MeshRescueRelay()
        }
        return MeshRescueRelay.instance
    }

    async initialize(): Promise<boolean> {
        try {
            Logger.info('🌐 Initializing Mesh Rescue Relay System')

            if (!BitChatModule) {
                Logger.error('❌ BitChat module not available - mesh relay disabled')
                return false
            }

            // Generate unique device ID
            this.deviceId = this.generateDeviceId()
            this.networkStatus.deviceId = this.deviceId
            
            Logger.info(`📱 Device ID: ${this.deviceId}`)

            // Initialize event emitter
            this.eventEmitter = new NativeEventEmitter(BitChatModule)
            this.setupEventListeners()

            // Start BitChat mesh service
            await BitChatModule.startMeshService()
            Logger.info('✅ BitChat mesh service started')

            // Start periodic tasks
            this.startBeaconBroadcast()
            this.startQueueProcessor()

            // Load persisted queue
            this.loadPersistedQueue()

            this.isInitialized = true
            this.networkStatus.isInitialized = true
            
            Logger.info('🎯 Mesh Rescue Relay System initialized successfully')
            return true

        } catch (error) {
            Logger.error(`❌ Failed to initialize Mesh Rescue Relay: ${error}`)
            return false
        }
    }

    private generateDeviceId(): string {
        const timestamp = Date.now().toString(36)
        const random = Math.random().toString(36).substr(2, 9)
        return `rescue_${timestamp}_${random}`
    }

    private setupEventListeners(): void {
        if (!this.eventEmitter) return

        // Handle incoming messages
        this.eventEmitter.addListener('onMessageReceived', (message: string) => {
            this.handleIncomingMessage(message)
        })

        // Handle peer updates
        this.eventEmitter.addListener('onPeerListUpdated', (peerList: any[]) => {
            this.updatePeerList(peerList)
        })

        Logger.info('📡 Event listeners configured')
    }

    private handleIncomingMessage(rawMessage: string): void {
        try {
            Logger.info(`📥 Received mesh message: ${rawMessage.substring(0, 100)}...`)
            
            const message = JSON.parse(rawMessage)
            
            if (!message.type || !message.id) {
                Logger.warn('⚠️ Invalid message format, ignoring')
                return
            }

            switch (message.type) {
                case MessageType.BEACON:
                    this.handleBeaconMessage(message)
                    break
                case MessageType.EMERGENCY:
                    this.handleEmergencyMessage(message)
                    break
                case MessageType.DATA:
                    this.handleDataMessage(message)
                    break
                case MessageType.ACK:
                    this.handleAckMessage(message)
                    break
                case MessageType.ROUTE_REQ:
                    this.handleRouteRequest(message)
                    break
                case MessageType.ROUTE_REPLY:
                    this.handleRouteReply(message)
                    break
                default:
                    Logger.debug(`📨 Unhandled message type: ${message.type}`)
            }

        } catch (error) {
            Logger.error(`❌ Failed to handle incoming message: ${error}`)
        }
    }

    private handleBeaconMessage(message: any): void {
        const peerId = message.deviceId
        if (peerId && peerId !== this.deviceId) {
            const peer = this.peers.get(peerId) || {
                id: peerId,
                name: message.deviceName || 'Unknown Device',
                isOnline: true,
                lastSeen: Date.now(),
                capabilities: message.capabilities || [],
                hasInternetAccess: false,
                queuedMessages: 0
            }
            
            peer.lastSeen = Date.now()
            peer.isOnline = true
            peer.hasInternetAccess = message.hasInternet || false
            
            this.peers.set(peerId, peer)
            this.networkStatus.peerCount = this.peers.size
            
            Logger.debug(`📍 Updated peer: ${peer.name} (Internet: ${peer.hasInternetAccess ? 'Yes' : 'No'})`)
        }
    }

    private handleEmergencyMessage(message: any): void {
        Logger.warn(`🚨 EMERGENCY MESSAGE: ${JSON.stringify(message)}`)
        
        // Forward emergency messages immediately
        if (message.victimData) {
            this.forwardToInternet(message.victimData, MessagePriority.CRITICAL)
        }
        
        // Send acknowledgment
        this.sendAck(message.id, message.deviceId)
    }

    private handleDataMessage(message: any): void {
        Logger.info(`📦 Data message received: ${message.id}`)
        
        if (message.victimData) {
            const priority = this.determinePriority(message.victimData)
            this.forwardToInternet(message.victimData, priority)
        }
        
        // Send acknowledgment
        this.sendAck(message.id, message.deviceId)
    }

    private handleAckMessage(message: any): void {
        Logger.info(`✅ ACK received for message: ${message.messageId}`)
        
        // Remove acknowledged message from queue
        this.messageQueue = this.messageQueue.filter(msg => msg.id !== message.messageId)
        this.persistQueue()
    }

    private handleRouteRequest(message: any): void {
        Logger.debug(`🗺️ Route request from: ${message.deviceId}`)
        // Route discovery logic would go here
    }

    private handleRouteReply(message: any): void {
        Logger.debug(`🗺️ Route reply from: ${message.deviceId}`)
        // Route handling logic would go here
    }

    private updatePeerList(peerList: any[]): void {
        Logger.info(`👥 Peer list updated: ${peerList.length} peers`)
        
        // Mark all peers as offline first
        this.peers.forEach(peer => {
            peer.isOnline = false
        })
        
        // Update with current peers
        peerList.forEach(peer => {
            const existingPeer = this.peers.get(peer.id) || {
                id: peer.id,
                name: peer.name || 'Unknown',
                isOnline: true,
                lastSeen: Date.now(),
                capabilities: [],
                hasInternetAccess: false,
                queuedMessages: 0
            }
            
            existingPeer.isOnline = true
            existingPeer.lastSeen = Date.now()
            this.peers.set(peer.id, existingPeer)
        })
        
        this.networkStatus.peerCount = peerList.length
    }

    async submitVictimData(victimData: any, priority: 'urgent' | 'high' | 'normal' | 'low' = 'high'): Promise<boolean> {
        try {
            Logger.info(`🚑 Submitting victim data via mesh relay (Priority: ${priority})`)
            
            // Check if BitChat module is available
            if (!BitChatModule) {
                Logger.warn('⚠️ BitChatNative module not available - mesh relay disabled')
                Logger.info('🔧 Operating in fallback mode - direct API only')
                
                // Check internet connectivity for direct submission
                const hasInternet = await this.checkInternetConnectivity()
                this.networkStatus.internetAccess = hasInternet
                
                if (hasInternet) {
                    Logger.info('🌐 Internet available - attempting direct submission')
                    const directSuccess = await this.submitDirectToAPI(victimData)
                    if (directSuccess) {
                        Logger.info('✅ Direct API submission successful')
                        return true
                    }
                    Logger.error('❌ Direct API submission failed - no mesh fallback available')
                    return false
                } else {
                    Logger.error('❌ No internet and no mesh capability - victim data cannot be transmitted')
                    Logger.warn('📱 Consider upgrading to full BitChatNative build for offline capabilities')
                    return false
                }
            }
            
            // Check internet connectivity first
            const hasInternet = await this.checkInternetConnectivity()
            this.networkStatus.internetAccess = hasInternet
            
            if (hasInternet) {
                Logger.info('🌐 Internet available - attempting direct submission')
                // Try direct API submission first
                const directSuccess = await this.submitDirectToAPI(victimData)
                if (directSuccess) {
                    Logger.info('✅ Direct API submission successful')
                    return true
                }
                Logger.warn('⚠️ Direct API submission failed, falling back to mesh')
            } else {
                Logger.info('📡 No internet - using mesh relay system')
            }

            // Fallback to mesh relay
            const meshPriority = this.mapPriorityToEnum(priority)
            const success = await this.queueForMeshRelay(victimData, meshPriority)
            
            if (success) {
                Logger.info('📤 Victim data queued for mesh relay')
                return true
            }
            
            Logger.error('❌ Failed to queue victim data for mesh relay')
            return false

        } catch (error) {
            Logger.error(`❌ Failed to submit victim data: ${error}`)
            return false
        }
    }

    private async checkInternetConnectivity(): Promise<boolean> {
        try {
            // Simple connectivity check with timeout
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000)
            
            const response = await fetch('https://www.google.com', {
                method: 'HEAD',
                signal: controller.signal
            })
            
            clearTimeout(timeoutId)
            return response.ok
        } catch {
            return false
        }
    }

    private async submitDirectToAPI(victimData: any): Promise<boolean> {
        // This would integrate with the existing RescueAPIService
        // For now, return false to force mesh relay testing
        return false
    }

    private mapPriorityToEnum(priority: string): MessagePriority {
        switch (priority.toLowerCase()) {
            case 'urgent': return MessagePriority.CRITICAL
            case 'high': return MessagePriority.SERIOUS
            case 'normal': return MessagePriority.HIGH
            case 'low': return MessagePriority.LOW
            default: return MessagePriority.NORMAL
        }
    }

    private determinePriority(victimData: any): MessagePriority {
        const victimInfo = victimData.victim_info || victimData.victim_data
        if (!victimInfo) return MessagePriority.NORMAL

        const emergencyStatus = victimInfo.emergency_status?.toLowerCase()
        if (emergencyStatus && EMERGENCY_PRIORITY_MAP[emergencyStatus]) {
            return EMERGENCY_PRIORITY_MAP[emergencyStatus]
        }

        // Check for critical indicators
        if (victimInfo.situation?.trapped === true) {
            return MessagePriority.CRITICAL
        }

        if (victimInfo.medical_info?.pain_level > 8) {
            return MessagePriority.SERIOUS
        }

        return MessagePriority.NORMAL
    }

    private async queueForMeshRelay(victimData: any, priority: MessagePriority): Promise<boolean> {
        try {
            const victimInfo = victimData.victim_info || victimData.victim_data
            const victimId = victimInfo?.id || `victim_${Date.now()}`
            
            const message: MeshMessage = {
                id: this.generateMessageId(),
                type: priority === MessagePriority.CRITICAL ? MessageType.EMERGENCY : MessageType.DATA,
                priority,
                timestamp: Date.now(),
                victimId,
                data: victimData,
                attempts: 0,
                lastAttempt: 0,
                maxRetries: priority === MessagePriority.CRITICAL ? 10 : 5,
                expiresAt: Date.now() + (priority === MessagePriority.CRITICAL ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000) // 24h for critical, 6h for others
            }

            // Insert in priority order
            this.insertMessageByPriority(message)
            this.networkStatus.queuedMessages = this.messageQueue.length
            
            Logger.info(`📋 Queued message ${message.id} with priority ${priority}`)
            
            // Persist queue
            this.persistQueue()
            
            // Try immediate transmission
            this.processMessageQueue()
            
            return true

        } catch (error) {
            Logger.error(`❌ Failed to queue message: ${error}`)
            return false
        }
    }

    private generateMessageId(): string {
        return `msg_${this.deviceId}_${++this.messageIdCounter}_${Date.now()}`
    }

    private insertMessageByPriority(message: MeshMessage): void {
        // Find insertion point based on priority
        let insertIndex = 0
        for (let i = 0; i < this.messageQueue.length; i++) {
            if (this.messageQueue[i].priority > message.priority) {
                insertIndex = i
                break
            }
            insertIndex = i + 1
        }
        
        this.messageQueue.splice(insertIndex, 0, message)
        Logger.debug(`📌 Inserted message at position ${insertIndex} (Priority: ${message.priority})`)
    }

    private startBeaconBroadcast(): void {
        this.beaconInterval = setInterval(() => {
            this.sendBeacon()
        }, 30000) // Every 30 seconds

        Logger.info('📡 Beacon broadcast started (30s interval)')
    }

    private startQueueProcessor(): void {
        this.queueProcessInterval = setInterval(() => {
            this.processMessageQueue()
        }, 10000) // Every 10 seconds

        Logger.info('⚙️ Queue processor started (10s interval)')
    }

    private async sendBeacon(): Promise<void> {
        if (!BitChatModule) return

        try {
            const beacon = {
                type: MessageType.BEACON,
                deviceId: this.deviceId,
                deviceName: `Rescue Device ${this.deviceId.substr(-6)}`,
                timestamp: Date.now(),
                capabilities: ['victim_data_relay', 'emergency_response'],
                hasInternet: this.networkStatus.internetAccess,
                queuedMessages: this.messageQueue.length
            }

            await BitChatModule.sendPublicMessage(JSON.stringify(beacon))
            this.networkStatus.lastBeacon = Date.now()
            
            Logger.debug('📡 Beacon sent')

        } catch (error) {
            Logger.error(`❌ Failed to send beacon: ${error}`)
        }
    }

    private async processMessageQueue(): Promise<void> {
        if (this.messageQueue.length === 0) return

        Logger.info(`⚙️ Processing message queue (${this.messageQueue.length} messages)`)

        // Process messages in priority order
        for (let i = 0; i < Math.min(this.messageQueue.length, 3); i++) {
            const message = this.messageQueue[i]
            
            // Check if message has expired
            if (Date.now() > message.expiresAt) {
                Logger.warn(`⏰ Message ${message.id} expired, removing from queue`)
                this.messageQueue.splice(i, 1)
                i--
                continue
            }

            // Check retry limits
            if (message.attempts >= message.maxRetries) {
                Logger.warn(`🚫 Message ${message.id} exceeded retry limit, removing from queue`)
                this.messageQueue.splice(i, 1)
                i--
                continue
            }

            // Check retry interval (exponential backoff)
            const retryDelay = Math.min(60000 * Math.pow(2, message.attempts), 300000) // Max 5 minutes
            if (Date.now() - message.lastAttempt < retryDelay) {
                continue
            }

            // Try to send message
            const success = await this.transmitMessage(message)
            message.attempts++
            message.lastAttempt = Date.now()

            if (success) {
                Logger.info(`✅ Message ${message.id} transmitted successfully`)
                // Keep in queue until ACK received
            } else {
                Logger.warn(`⚠️ Message ${message.id} transmission failed (attempt ${message.attempts}/${message.maxRetries})`)
            }
        }

        this.networkStatus.queuedMessages = this.messageQueue.length
        this.persistQueue()
    }

    private async transmitMessage(message: MeshMessage): Promise<boolean> {
        if (!BitChatModule) return false

        try {
            // Check for peers with internet access
            const internetPeers = Array.from(this.peers.values()).filter(peer => 
                peer.isOnline && peer.hasInternetAccess
            )

            if (internetPeers.length > 0) {
                Logger.info(`📤 Transmitting to ${internetPeers.length} internet-connected peers`)
            } else {
                Logger.info('📤 Broadcasting to all peers (no internet-connected peers found)')
            }

            const meshMessage = {
                ...message,
                sourceDevice: this.deviceId,
                hopCount: 0,
                targetType: internetPeers.length > 0 ? 'internet_gateway' : 'broadcast'
            }

            await BitChatModule.sendPublicMessage(JSON.stringify(meshMessage))
            this.networkStatus.relayedMessages++
            
            return true

        } catch (error) {
            Logger.error(`❌ Failed to transmit message: ${error}`)
            return false
        }
    }

    private sendAck(messageId: string, targetDeviceId: string): void {
        if (!BitChatModule) return

        try {
            const ack = {
                type: MessageType.ACK,
                messageId,
                deviceId: this.deviceId,
                targetDevice: targetDeviceId,
                timestamp: Date.now()
            }

            BitChatModule.sendPublicMessage(JSON.stringify(ack))
            Logger.debug(`✅ ACK sent for message ${messageId}`)

        } catch (error) {
            Logger.error(`❌ Failed to send ACK: ${error}`)
        }
    }

    private forwardToInternet(victimData: any, priority: MessagePriority): void {
        Logger.info(`🌐 Forwarding victim data to internet (Priority: ${priority})`)
        // This would integrate with existing RescueAPIService
        // For now, just log the action
    }

    private persistQueue(): void {
        try {
            const queueData = JSON.stringify(this.messageQueue)
            mmkvSync.set('mesh_rescue_queue', queueData)
            Logger.debug(`💾 Queue persisted (${this.messageQueue.length} messages)`)
        } catch (error) {
            Logger.error(`❌ Failed to persist queue: ${error}`)
        }
    }

    private loadPersistedQueue(): void {
        try {
            const queueData = mmkvSync.getString('mesh_rescue_queue')
            if (queueData) {
                this.messageQueue = JSON.parse(queueData)
                this.networkStatus.queuedMessages = this.messageQueue.length
                Logger.info(`📂 Loaded ${this.messageQueue.length} messages from persistent storage`)
            }
        } catch (error) {
            Logger.error(`❌ Failed to load persisted queue: ${error}`)
            this.messageQueue = []
        }
    }

    // Public API methods
    getNetworkStatus(): NetworkStatus {
        return { ...this.networkStatus }
    }

    getPeers(): PeerInfo[] {
        return Array.from(this.peers.values())
    }

    getQueuedMessages(): Partial<MeshMessage>[] {
        return this.messageQueue.map(msg => ({
            id: msg.id,
            type: msg.type,
            priority: msg.priority,
            timestamp: msg.timestamp,
            victimId: msg.victimId,
            attempts: msg.attempts,
            lastAttempt: msg.lastAttempt
        }))
    }

    async shutdown(): Promise<void> {
        Logger.info('🔌 Shutting down Mesh Rescue Relay System')

        if (this.beaconInterval) {
            clearInterval(this.beaconInterval)
            this.beaconInterval = null
        }

        if (this.queueProcessInterval) {
            clearInterval(this.queueProcessInterval)
            this.queueProcessInterval = null
        }

        this.persistQueue()

        if (BitChatModule) {
            try {
                await BitChatModule.stopMeshService()
                Logger.info('✅ BitChat mesh service stopped')
            } catch (error) {
                Logger.error(`❌ Failed to stop mesh service: ${error}`)
            }
        }

        this.isInitialized = false
        this.networkStatus.isInitialized = false
        
        Logger.info('🔌 Mesh Rescue Relay System shutdown complete')
    }
}