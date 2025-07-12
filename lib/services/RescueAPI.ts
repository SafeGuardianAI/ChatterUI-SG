import { mmkv } from '@lib/storage/MMKV'
import { Logger } from '@lib/state/Logger'

interface VictimInfo {
    [key: string]: any
}

interface RescueAPIConfig {
    endpoint: string
    mongodbUri?: string
    firebaseConfig?: any
}

// MongoDB template - matches victim_json_template_flat.json
const MONGODB_VICTIM_TEMPLATE = {
    "victim_data": {
        "id": "",
        "emergency_status": "",
        "location": {
            "lat": 0.0,
            "lon": 0.0,
            "details": "",
            "nearest_landmark": ""
        },
        "personal_info": {
            "name": "",
            "age": 0,
            "gender": "",
            "language": "",
            "physical_description": ""
        },
        "medical_info": {
            "injuries": [],
            "pain_level": 0,
            "medical_conditions": [],
            "medications": [],
            "allergies": [],
            "blood_type": ""
        },
        "situation": {
            "disaster_type": "",
            "immediate_needs": [],
            "trapped": false,
            "mobility": "",
            "nearby_hazards": []
        },
        "contact_info": {
            "phone": "",
            "email": "",
            "emergency_contact": {
                "name": "",
                "relationship": "",
                "phone": ""
            }
        },
        "resources": {
            "food_status": "",
            "water_status": "",
            "shelter_status": "",
            "communication_devices": []
        },
        "rescue_info": {
            "last_contact": "",
            "rescue_team_eta": "",
            "special_rescue_needs": ""
        },
        "environmental_data": {
            "temperature": 0,
            "humidity": 0,
            "air_quality": "",
            "weather": ""
        },
        "device_data": {
            "battery_level": 0,
            "network_status": ""
        },
        "social_info": {
            "group_size": 0,
            "dependents": 0,
            "nearby_victims_count": 0,
            "can_communicate_verbally": false
        },
        "psychological_status": {
            "stress_level": "",
            "special_needs": ""
        }
    }
}

export enum BackendType {
    FIREBASE = 'firebase',
    MONGODB = 'mongodb'
}

export class RescueAPIService {
    private static instance: RescueAPIService | null = null
    private endpoint: string
    private initialized: boolean = false
    private victimTemplate: any = null
    private backendType: BackendType = BackendType.MONGODB

    private constructor(endpoint: string = 'https://safeguardian-33b94228882a.herokuapp.com/') {
        this.endpoint = endpoint
    }

    static getInstance(endpoint?: string): RescueAPIService {
        if (!RescueAPIService.instance) {
            RescueAPIService.instance = new RescueAPIService(endpoint)
        }
        return RescueAPIService.instance
    }

    setBackendType(type: BackendType): void {
        this.backendType = type
        Logger.info(`Switched to ${type} backend`)
    }

    getBackendType(): BackendType {
        // Check which backend is enabled
        const firebaseEnabled = mmkv.getBoolean(RescueAPISettings.FirebaseEnabled) ?? false
        const mongodbEnabled = mmkv.getBoolean(RescueAPISettings.MongoDBEnabled) ?? false
        
        if (firebaseEnabled && !mongodbEnabled) {
            return BackendType.FIREBASE
        }
        // Default to MongoDB if both or neither are enabled
        return BackendType.MONGODB
    }

    async initialize(): Promise<void> {
        if (this.initialized) return

        try {
            // Update backend type based on settings
            this.backendType = this.getBackendType()
            
            // Initialize victim template based on backend type
            if (this.backendType === BackendType.MONGODB) {
                this.victimTemplate = { ...MONGODB_VICTIM_TEMPLATE }
            } else {
                // Firebase uses nested structure
                this.victimTemplate = {
                    victim_info: {
                        name: '',
                        age: null,
                        gender: '',
                        physical_description: '',
                        last_known_location: {
                            latitude: null,
                            longitude: null,
                            address: '',
                            landmark: ''
                        },
                        contact_info: {
                            phone: '',
                            emergency_contact: '',
                            relationship: ''
                        }
                    },
                    medical_info: {
                        conditions: [],
                        medications: [],
                        allergies: [],
                        blood_type: '',
                        special_needs: ''
                    },
                    emergency_status: 'unknown',
                    rescue_status: 'pending',
                    additional_notes: '',
                    timestamp: new Date().toISOString(),
                    last_updated: new Date().toISOString()
                }
            }

            this.initialized = true
            Logger.info('RescueAPI initialized successfully')
        } catch (error) {
            Logger.error(`Failed to initialize RescueAPI: ${error}`)
            throw error
        }
    }

    private async makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
        try {
            const url = this.endpoint + endpoint
            const backend = this.getBackendType()
            Logger.debug(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Making ${method} request to: ${url}`)
            if (data) {
                Logger.debug(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Request body: ${JSON.stringify(data, null, 2)}`)
            }
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: data ? JSON.stringify(data) : undefined,
            })

            const responseText = await response.text()
            Logger.debug(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Response status: ${response.status}`)
            Logger.debug(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Response body: ${responseText}`)

            if (response.status === 200) {
                try {
                    const jsonResponse = JSON.parse(responseText)
                    if (jsonResponse.error) {
                        Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] API Error: ${jsonResponse.error}`)
                        return jsonResponse.error
                    }
                    return jsonResponse
                } catch (parseError) {
                    // MongoDB returns ObjectId as plain string
                    if (backend === BackendType.MONGODB && /^[0-9a-fA-F]{24}$/.test(responseText.trim())) {
                        Logger.debug(`[MongoDB] Response is ObjectId: ${responseText.trim()}`)
                        return responseText.trim()
                    }
                    // Firebase returns ID with prefix
                    if (backend === BackendType.FIREBASE && responseText.trim().startsWith('-')) {
                        Logger.debug(`[Firebase] Response is Firebase ID: ${responseText.trim()}`)
                        return responseText.trim()
                    }
                    Logger.error(`Failed to parse response JSON: ${parseError}`)
                    return responseText
                }
            } else if (response.status === 422) {
                // FastAPI validation error
                Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Validation error (422): ${responseText}`)
                try {
                    const error = JSON.parse(responseText)
                    Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Validation details: ${JSON.stringify(error.detail)}`)
                } catch {}
                return null
            } else {
                const errorMsg = `Request failed with status code: ${response.status}`
                Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] ${errorMsg} - Response: ${responseText}`)
                return null
            }
        } catch (error) {
            Logger.error(`[${this.getBackendType() === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Request error: ${error}`)
            return null
        }
    }

    /**
     * Normalize victim data based on backend type
     */
    private normalizeVictimData(data: any): any {
        const backend = this.getBackendType()
        
        if (backend === BackendType.MONGODB) {
            // For MongoDB, flatten the structure
            return this.flattenForMongoDB(data)
        } else {
            // For Firebase, use nested structure
            return this.normalizeForFirebase(data)
        }
    }

    /**
     * Convert victim data to MongoDB format (victim_data root with nested structure)
     */
    private flattenForMongoDB(data: any): any {
        // If already has victim_data root, return as is
        if (data && data.victim_data) {
            return data
        }

        // Convert from victim_info to victim_data format
        if (!data || !data.victim_info) {
            return { victim_data: { ...MONGODB_VICTIM_TEMPLATE.victim_data } }
        }

        const victimInfo = data.victim_info
        const victimData: any = {
            id: victimInfo.id || "",
            emergency_status: victimInfo.emergency_status || "",
            location: {},
            personal_info: {},
            medical_info: {},
            situation: {},
            contact_info: {},
            resources: {},
            rescue_info: {},
            environmental_data: {},
            device_data: {},
            social_info: {},
            psychological_status: {}
        }

        // Map personal_info
        if (victimInfo.personal_info) {
            victimData.personal_info = {
                name: victimInfo.personal_info.name || "",
                age: victimInfo.personal_info.age || 0,
                gender: victimInfo.personal_info.gender || "",
                language: victimInfo.personal_info.language || "",
                physical_description: victimInfo.personal_info.physical_description || ""
            }
        }

        // Map location
        if (victimInfo.location) {
            victimData.location = {
                lat: victimInfo.location.lat || 0.0,
                lon: victimInfo.location.lon || 0.0,
                details: victimInfo.location.details || "",
                nearest_landmark: victimInfo.location.nearest_landmark || ""
            }
        }

        // Map medical_info
        if (victimInfo.medical_info) {
            victimData.medical_info = {
                injuries: victimInfo.medical_info.injuries || [],
                pain_level: victimInfo.medical_info.pain_level || 0,
                medical_conditions: victimInfo.medical_info.medical_conditions || [],
                medications: victimInfo.medical_info.medications || [],
                allergies: victimInfo.medical_info.allergies || [],
                blood_type: victimInfo.medical_info.blood_type || ""
            }
        }

        // Map situation
        if (victimInfo.situation) {
            victimData.situation = {
                disaster_type: victimInfo.situation.disaster_type || "",
                immediate_needs: victimInfo.situation.immediate_needs || [],
                trapped: victimInfo.situation.trapped || false,
                mobility: victimInfo.situation.mobility || "",
                nearby_hazards: victimInfo.situation.nearby_hazards || []
            }
        }

        // Map contact_info
        if (victimInfo.contact_info) {
            victimData.contact_info = {
                phone: victimInfo.contact_info.phone || "",
                email: victimInfo.contact_info.email || "",
                emergency_contact: victimInfo.contact_info.emergency_contact || {
                    name: "",
                    relationship: "",
                    phone: ""
                }
            }
        }

        // Map resources
        if (victimInfo.resources) {
            victimData.resources = {
                food_status: victimInfo.resources.food_status || "",
                water_status: victimInfo.resources.water_status || "",
                shelter_status: victimInfo.resources.shelter_status || "",
                communication_devices: victimInfo.resources.communication_devices || []
            }
        }

        // Map rescue_info
        if (victimInfo.rescue_info) {
            victimData.rescue_info = {
                last_contact: victimInfo.rescue_info.last_contact || "",
                rescue_team_eta: victimInfo.rescue_info.rescue_team_eta || "",
                special_rescue_needs: victimInfo.rescue_info.special_rescue_needs || ""
            }
        }

        // Map environmental_data
        if (victimInfo.environmental_data) {
            victimData.environmental_data = {
                temperature: victimInfo.environmental_data.temperature || 0,
                humidity: victimInfo.environmental_data.humidity || 0,
                air_quality: victimInfo.environmental_data.air_quality || "",
                weather: victimInfo.environmental_data.weather || ""
            }
        }

        // Map device_data
        if (victimInfo.device_data) {
            victimData.device_data = {
                battery_level: victimInfo.device_data.battery_level || 0,
                network_status: victimInfo.device_data.network_status || ""
            }
        }

        // Map social_info
        if (victimInfo.social_info) {
            victimData.social_info = {
                group_size: victimInfo.social_info.group_size || 0,
                dependents: victimInfo.social_info.dependents || 0,
                nearby_victims_count: victimInfo.social_info.nearby_victims_count || 0,
                can_communicate_verbally: victimInfo.social_info.can_communicate_verbally || false
            }
        }

        // Map psychological_status
        if (victimInfo.psychological_status) {
            victimData.psychological_status = {
                stress_level: victimInfo.psychological_status.stress_level || "",
                special_needs: victimInfo.psychological_status.special_needs || ""
            }
        }

        return { victim_data: victimData }
    }

    /**
     * Normalize victim data for Firebase (existing normalization logic)
     */
    private normalizeForFirebase(data: any): any {
        if (!data || !data.victim_info) {
            return data
        }

        const victimInfo = data.victim_info
        const normalized = { ...data }

        // If we have flat fields at victim_info level, reorganize them
        if (victimInfo.name || victimInfo.age || victimInfo.gender) {
            // Create personal_info if it doesn't exist
            if (!victimInfo.personal_info) {
                victimInfo.personal_info = {}
            }
            
            // Move flat fields to personal_info
            if (victimInfo.name) {
                victimInfo.personal_info.name = victimInfo.name
                delete victimInfo.name
            }
            if (victimInfo.age !== undefined) {
                victimInfo.personal_info.age = victimInfo.age
                delete victimInfo.age
            }
            if (victimInfo.gender) {
                victimInfo.personal_info.gender = victimInfo.gender
                delete victimInfo.gender
            }
            if (victimInfo.physical_description) {
                victimInfo.personal_info.physical_description = victimInfo.physical_description
                delete victimInfo.physical_description
            }
            if (victimInfo.language) {
                victimInfo.personal_info.language = victimInfo.language
                delete victimInfo.language
            }
        }

        // Handle location fields
        if (victimInfo.lat !== undefined || victimInfo.lon !== undefined || victimInfo.details || victimInfo.nearest_landmark) {
            if (!victimInfo.location) {
                victimInfo.location = {}
            }
            
            if (victimInfo.lat !== undefined) {
                victimInfo.location.lat = victimInfo.lat
                delete victimInfo.lat
            }
            if (victimInfo.lon !== undefined) {
                victimInfo.location.lon = victimInfo.lon
                delete victimInfo.lon
            }
            if (victimInfo.details) {
                victimInfo.location.details = victimInfo.details
                delete victimInfo.details
            }
            if (victimInfo.nearest_landmark) {
                victimInfo.location.nearest_landmark = victimInfo.nearest_landmark
                delete victimInfo.nearest_landmark
            }
        }

        // Handle medical fields
        if (victimInfo.medical_condition || victimInfo.injuries || victimInfo.pain_level !== undefined) {
            if (!victimInfo.medical_info) {
                victimInfo.medical_info = {}
            }
            
            if (victimInfo.medical_condition) {
                // Convert single condition to array
                victimInfo.medical_info.conditions = [victimInfo.medical_condition]
                delete victimInfo.medical_condition
            }
            if (victimInfo.injuries) {
                victimInfo.medical_info.injuries = Array.isArray(victimInfo.injuries) ? victimInfo.injuries : [victimInfo.injuries]
                delete victimInfo.injuries
            }
            if (victimInfo.pain_level !== undefined) {
                victimInfo.medical_info.pain_level = victimInfo.pain_level
                delete victimInfo.pain_level
            }
        }

        // Handle status fields
        if (victimInfo.status) {
            // Try to parse status string for emergency status
            const statusLower = victimInfo.status.toLowerCase()
            if (statusLower.includes('critical')) {
                victimInfo.emergency_status = 'critical'
            } else if (statusLower.includes('serious')) {
                victimInfo.emergency_status = 'serious'
            } else if (statusLower.includes('stable')) {
                victimInfo.emergency_status = 'stable'
            } else if (statusLower.includes('rescued')) {
                victimInfo.emergency_status = 'rescued'
            } else {
                victimInfo.emergency_status = 'unknown'
            }
            delete victimInfo.status
        }

        // Handle urgent_needs
        if (victimInfo.urgent_needs || victimInfo.immediate_needs) {
            if (!victimInfo.situation) {
                victimInfo.situation = {}
            }
            victimInfo.situation.immediate_needs = victimInfo.urgent_needs || victimInfo.immediate_needs
            delete victimInfo.urgent_needs
            delete victimInfo.immediate_needs
        }

        normalized.victim_info = victimInfo
        return normalized
    }

    async postVictim(victimInfo: VictimInfo): Promise<string | null> {
        if (!this.initialized) await this.initialize()
        
        try {
            const backend = this.getBackendType()
            const normalizedData = this.normalizeVictimData(victimInfo)
            Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Posting new victim`)
            Logger.debug(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Sending normalized victim data: ${JSON.stringify(normalizedData)}`)
            
            const endpoint = backend === BackendType.MONGODB ? 'victim/report' : 'victim/create'
            const result = await this.makeRequest('POST', endpoint, normalizedData)
            
            if (backend === BackendType.MONGODB) {
                // MongoDB should return ObjectId (24 hex characters)
                if (result && typeof result === 'string') {
                    // Check if it's a valid MongoDB ObjectId
                    if (/^[0-9a-fA-F]{24}$/.test(result)) {
                        Logger.info(`[MongoDB] Victim created with ObjectId: ${result}`)
                        Logger.infoToast(`MongoDB: New victim created with ID: ${result.substring(0, 8)}...`)
                        return result
                    } else if (result.startsWith('-')) {
                        // Backend returned Firebase ID for MongoDB - this is an error
                        Logger.error(`[MongoDB] Backend returned Firebase-style ID instead of ObjectId: ${result}`)
                        Logger.errorToast('Backend configuration error: MongoDB should return ObjectId, not Firebase ID')
                        // Still save it so we don't lose the victim
                        return result
                    }
                } else if (result && result.victim_number) {
                    const id = result.victim_number
                    if (/^[0-9a-fA-F]{24}$/.test(id)) {
                        Logger.info(`[MongoDB] Victim created with ObjectId: ${id}`)
                        return id
                    } else if (id.startsWith('-')) {
                        Logger.error(`[MongoDB] Backend returned Firebase-style ID instead of ObjectId: ${id}`)
                        Logger.errorToast('Backend configuration error: MongoDB should return ObjectId, not Firebase ID')
                        return id
                    }
                }
            } else {
                // Firebase returns ID with prefix
                if (result && typeof result === 'string' && result.startsWith('-')) {
                    Logger.info(`[Firebase] Victim created with ID: ${result}`)
                    Logger.infoToast(`Firebase: New victim created with ID: ${result.substring(0, 10)}...`)
                    return result
                } else if (result && result.victim_id) {
                    Logger.info(`[Firebase] Victim created with ID: ${result.victim_id}`)
                    return result.victim_id
                }
            }
            
            Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Unexpected response format: ${JSON.stringify(result)}`)
            return null
        } catch (error) {
            const backend = this.getBackendType()
            Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Failed to post victim: ${error}`)
            return null
        }
    }

    async updateVictim(victimNumber: string, victimInfo: VictimInfo): Promise<any> {
        if (!this.initialized) await this.initialize()
        
        const backend = this.getBackendType()
        
        // Validate ID format based on backend - but be flexible
        if (backend === BackendType.MONGODB) {
            const isMongoId = /^[0-9a-fA-F]{24}$/.test(victimNumber)
            const isFirebaseId = victimNumber.startsWith('-')
            
            if (!isMongoId && !isFirebaseId) {
                Logger.error(`[MongoDB] Invalid ID format: ${victimNumber}`)
                return null
            }
            
            if (isFirebaseId) {
                Logger.warn(`[MongoDB] Using Firebase-style ID with MongoDB backend: ${victimNumber}`)
                Logger.warn(`[MongoDB] Backend should be updated to use proper ObjectIds`)
            }
        } else {
            // Firebase validation
            if (!victimNumber.startsWith('-') || victimNumber.length < 15) {
                // Also accept MongoDB ObjectIds for flexibility
                if (!/^[0-9a-fA-F]{24}$/.test(victimNumber)) {
                    Logger.error(`[Firebase] Invalid ID format: ${victimNumber}`)
                    return null
                }
                Logger.warn(`[Firebase] Using MongoDB ObjectId with Firebase backend: ${victimNumber}`)
            }
        }

        // Normalize the data structure
        const normalizedData = this.normalizeVictimData(victimInfo)
        Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Updating victim ${victimNumber}`)
        Logger.debug(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Updating with normalized data: ${JSON.stringify(normalizedData)}`)

        const endpoint = backend === BackendType.MONGODB 
            ? `victim/update/${victimNumber}` 
            : `victim/${victimNumber}/update`
            
        const result = await this.makeRequest('POST', endpoint, normalizedData)
        
        if (result && result.message) {
            Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] ${result.message}`)
            Logger.infoToast(`${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}: Victim ${victimNumber.substring(0, 8)}... updated`)
        }
        
        return result
    }

    async getVictimFromId(victimNumber: string): Promise<any> {
        if (!this.initialized) await this.initialize()
        
        const backend = this.getBackendType()
        
        // Validate ID format based on backend - but be flexible
        if (backend === BackendType.MONGODB) {
            const isMongoId = /^[0-9a-fA-F]{24}$/.test(victimNumber)
            const isFirebaseId = victimNumber.startsWith('-')
            
            if (!isMongoId && !isFirebaseId) {
                Logger.error(`[MongoDB] Invalid ID format: ${victimNumber}`)
                return null
            }
            
            if (isFirebaseId) {
                Logger.warn(`[MongoDB] Fetching with Firebase-style ID from MongoDB: ${victimNumber}`)
            }
        } else {
            if (!victimNumber.startsWith('-') || victimNumber.length < 15) {
                if (!/^[0-9a-fA-F]{24}$/.test(victimNumber)) {
                    Logger.error(`[Firebase] Invalid ID format: ${victimNumber}`)
                    return null
                }
                Logger.warn(`[Firebase] Fetching with MongoDB ObjectId from Firebase: ${victimNumber}`)
            }
        }

        Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Fetching victim ${victimNumber}`)
        return await this.makeRequest('GET', `victim/${victimNumber}`)
    }

    async getAllVictims(): Promise<any> {
        if (!this.initialized) await this.initialize()
        const backend = this.getBackendType()
        Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Fetching all victims`)
        const endpoint = backend === BackendType.MONGODB ? 'victims/all' : 'victims'
        const result = await this.makeRequest('GET', endpoint)
        
        if (Array.isArray(result)) {
            Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Retrieved ${result.length} victims from database`)
        } else if (result && typeof result === 'object' && Object.keys(result).length === 0) {
            Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Database is empty (no victims found)`)
        }
        
        return result
    }

    /**
     * Test connection based on backend type
     */
    async testConnection(): Promise<boolean> {
        try {
            const backend = this.getBackendType()
            Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Testing connection...`)
            const result = await this.getAllVictims()
            
            if (result !== null && result !== undefined) {
                Logger.info(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Connection successful!`)
                Logger.infoToast(`${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'} connection verified successfully`)
                return true
            } else {
                Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Connection failed - no response`)
                return false
            }
        } catch (error) {
            const backend = this.getBackendType()
            Logger.error(`[${backend === BackendType.MONGODB ? 'MongoDB' : 'Firebase'}] Connection test failed: ${error}`)
            return false
        }
    }

    /**
     * Test MongoDB connection
     */
    async testMongoDBConnection(): Promise<boolean> {
        // Temporarily set backend to MongoDB for this test
        const originalBackend = this.backendType
        this.backendType = BackendType.MONGODB
        const result = await this.testConnection()
        this.backendType = originalBackend
        return result
    }

    /**
     * Test Firebase connection
     */
    async testFirebaseConnection(): Promise<boolean> {
        // Temporarily set backend to Firebase for this test
        const originalBackend = this.backendType
        this.backendType = BackendType.FIREBASE
        const result = await this.testConnection()
        this.backendType = originalBackend
        return result
    }

    /**
     * Parse AI-generated content to extract victim information
     * This method attempts to parse JSON-formatted rescue data from AI responses
     */
    parseAIResponse(content: string): VictimInfo | null {
        try {
            // First try to clean up common JSON issues
            let cleanedContent = content.trim()
            
            // Remove any text before the first { and after the last }
            const firstBrace = cleanedContent.indexOf('{')
            const lastBrace = cleanedContent.lastIndexOf('}')
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1)
            }
            
            // Try to parse the cleaned content
            try {
                const parsed = JSON.parse(cleanedContent)
                Logger.info('Successfully parsed AI response as JSON')
                
                // Check if it has the expected structure (either victim_info or victim_data)
                if (!parsed.victim_info && !parsed.victim_data) {
                    Logger.warn('Parsed JSON missing victim_info or victim_data root object')
                    Logger.debug(`Parsed structure: ${JSON.stringify(Object.keys(parsed))}`)
                }
                
                return parsed
            } catch (parseError: any) {
                // Log detailed parse error
                Logger.error(`JSON parse error: ${parseError.message}`)
                
                // Try to identify the specific issue
                const lines = cleanedContent.split('\n')
                let errorLine = -1
                let errorPosition = -1
                
                // Extract line and position from error message if available
                const errorMatch = parseError.message.match(/position (\d+)/)
                if (errorMatch) {
                    errorPosition = parseInt(errorMatch[1])
                    let charCount = 0
                    for (let i = 0; i < lines.length; i++) {
                        if (charCount + lines[i].length >= errorPosition) {
                            errorLine = i
                            break
                        }
                        charCount += lines[i].length + 1 // +1 for newline
                    }
                }
                
                if (errorLine >= 0) {
                    Logger.error(`Parse error likely on line ${errorLine + 1}: ${lines[errorLine]}`)
                }
                
                // Log a snippet around the error position
                if (errorPosition >= 0) {
                    const start = Math.max(0, errorPosition - 50)
                    const end = Math.min(cleanedContent.length, errorPosition + 50)
                    const snippet = cleanedContent.substring(start, end)
                    const relativePos = errorPosition - start
                    Logger.error(`Error context: ...${snippet}...`)
                    Logger.error(`Error position: ${' '.repeat(3 + relativePos)}^`)
                }
                
                // Try to extract any valid JSON objects from the content
                const objectMatches = cleanedContent.matchAll(/\{[^{}]*\}/g)
                for (const match of objectMatches) {
                    try {
                        const obj = JSON.parse(match[0])
                        Logger.warn(`Found partial valid JSON object: ${JSON.stringify(obj).substring(0, 100)}...`)
                    } catch {
                        // Ignore invalid matches
                    }
                }
                
                throw parseError
            }
        } catch (error) {
            Logger.error('Failed to parse AI response as JSON - may need to adjust grammar constraints')
            return null
        }
    }

    /**
     * Validate that the parsed data contains minimum required fields
     */
    validateVictimData(data: any): boolean {
        if (!data || typeof data !== 'object') {
            Logger.error('Victim data is not an object')
            return false
        }
        
        // Check for victim_info or victim_data root
        const victimInfo = data.victim_info || data.victim_data
        if (!victimInfo) {
            Logger.error('Missing victim_info or victim_data root object')
            return false
        }
        
        const foundFields = []
        const missingFields = []
        
        // Check for essential fields in either flat or nested structure
        // Personal info fields
        const hasName = !!(victimInfo.personal_info?.name || victimInfo.name)
        const hasAge = !!(victimInfo.personal_info?.age !== undefined || victimInfo.age !== undefined)
        
        // Location fields
        const hasLocation = !!(victimInfo.location || 
                             victimInfo.lat !== undefined || 
                             victimInfo.lon !== undefined ||
                             victimInfo.details ||
                             victimInfo.nearest_landmark)
        
        // Emergency status
        const hasEmergencyStatus = !!(victimInfo.emergency_status || 
                                     data.emergency_status ||
                                     victimInfo.status)
        
        // Medical info
        const hasMedicalInfo = !!(victimInfo.medical_info ||
                                 victimInfo.medical_condition ||
                                 victimInfo.injuries ||
                                 victimInfo.pain_level !== undefined)
        
        // Collect found fields
        if (hasName) foundFields.push('name')
        if (hasAge) foundFields.push('age')
        if (hasLocation) foundFields.push('location')
        if (hasEmergencyStatus) foundFields.push('emergency_status')
        if (hasMedicalInfo) foundFields.push('medical_info')
        
        // We need at least some identifying information
        const hasMinimumInfo = hasName || hasAge || hasLocation
        
        if (!hasMinimumInfo) {
            Logger.error('Victim data must contain at least name, age, or location information')
            return false
        }
        
        // Log what fields were found
        Logger.info(`Victim data contains fields: ${foundFields.join(', ')}`)
        
        // List all top-level fields found
        const allFields = Object.keys(victimInfo)
        Logger.debug(`All ${data.victim_info ? 'victim_info' : 'victim_data'} fields: ${allFields.join(', ')}`)
        
        return true
    }

    /**
     * Get the victim template for grammar generation
     */
    getVictimTemplate(): any {
        return this.victimTemplate
    }
}

// Storage keys for rescue API settings
export const RescueAPISettings = {
    Enabled: 'rescue_api_enabled',
    Endpoint: 'rescue_api_endpoint',
    AutoReport: 'rescue_api_auto_report',
    LastVictimNumber: 'rescue_api_last_victim_number',
    FirebaseEnabled: 'rescue_api_firebase_enabled',
    MongoDBEnabled: 'rescue_api_mongodb_enabled',
}

// Initialize settings with defaults
export const initializeRescueAPISettings = () => {
    if (mmkv.getString(RescueAPISettings.Endpoint) === undefined) {
        mmkv.set(RescueAPISettings.Endpoint, 'https://safeguardian-33b94228882a.herokuapp.com/')
    }
    if (mmkv.getBoolean(RescueAPISettings.Enabled) === undefined) {
        mmkv.set(RescueAPISettings.Enabled, false)
    }
    if (mmkv.getBoolean(RescueAPISettings.AutoReport) === undefined) {
        mmkv.set(RescueAPISettings.AutoReport, true)
    }
    if (mmkv.getBoolean(RescueAPISettings.FirebaseEnabled) === undefined) {
        mmkv.set(RescueAPISettings.FirebaseEnabled, false)
    }
    if (mmkv.getBoolean(RescueAPISettings.MongoDBEnabled) === undefined) {
        mmkv.set(RescueAPISettings.MongoDBEnabled, true)
    }
} 