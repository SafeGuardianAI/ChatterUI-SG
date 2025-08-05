import { Logger } from '@lib/state/Logger'
import { LLguidanceModule } from './LLguidanceModule'

export interface LLguidanceConfig {
    temperature?: number
    maxTokens?: number
    stopSequences?: string[]
    grammarType: 'gbnf' | 'json-schema' | 'regex' | 'llguidance-native'
    grammarContent: string
    enableCache?: boolean
    debugMode?: boolean
}

export interface LLguidanceResponse {
    text: string
    tokens: number[]
    logprobs?: number[]
    finishReason: 'length' | 'stop' | 'grammar' | 'error'
    metadata?: {
        grammarSteps: number
        cacheHits: number
        executionTime: number
    }
}

export class LLguidanceEngine {
    private static instance: LLguidanceEngine | null = null
    private isInitialized = false
    private grammarCache = new Map<string, any>()

    static getInstance(): LLguidanceEngine {
        if (!this.instance) {
            this.instance = new LLguidanceEngine()
        }
        return this.instance
    }

    async initialize(): Promise<boolean> {
        try {
            // Initialize LLguidance native module
            // This would typically load the native LLguidance library
            Logger.info('Initializing LLguidance engine...')
            
            // Check if LLguidance is available
            const isAvailable = await this.checkLLguidanceAvailability()
            if (!isAvailable) {
                Logger.warn('LLguidance not available, falling back to GBNF')
                return false
            }

            this.isInitialized = true
            Logger.info('LLguidance engine initialized successfully')
            return true
        } catch (error) {
            Logger.error(`Failed to initialize LLguidance: ${error}`)
            return false
        }
    }

    private async checkLLguidanceAvailability(): Promise<boolean> {
        try {
            // Initialize the LLguidance module and check availability
            const initialized = await LLguidanceModule.initialize()
            if (!initialized) {
                Logger.debug('LLguidance module initialization failed')
                return false
            }
            
            const available = await LLguidanceModule.isAvailable()
            Logger.debug(`LLguidance availability check: ${available} (Native: ${LLguidanceModule.isNative})`)
            return available
        } catch (error) {
            Logger.error('Failed to check LLguidance availability:', error)
            return false
        }
    }

    async compileGrammar(config: LLguidanceConfig): Promise<string> {
        if (!this.isInitialized) {
            throw new Error('LLguidance engine not initialized')
        }

        const cacheKey = `${config.grammarType}:${config.grammarContent}`
        
        if (config.enableCache && this.grammarCache.has(cacheKey)) {
            Logger.debug('Using cached grammar compilation')
            return this.grammarCache.get(cacheKey)
        }

        try {
            let compiledGrammar: string

            switch (config.grammarType) {
                case 'gbnf':
                    compiledGrammar = await this.compileGBNF(config.grammarContent)
                    break
                case 'json-schema':
                    compiledGrammar = await this.compileJsonSchema(config.grammarContent)
                    break
                case 'regex':
                    compiledGrammar = await this.compileRegex(config.grammarContent)
                    break
                case 'llguidance-native':
                    compiledGrammar = config.grammarContent // Already in LLguidance format
                    break
                default:
                    throw new Error(`Unsupported grammar type: ${config.grammarType}`)
            }

            if (config.enableCache) {
                this.grammarCache.set(cacheKey, compiledGrammar)
            }

            return compiledGrammar
        } catch (error) {
            Logger.error(`Grammar compilation failed: ${error}`)
            throw error
        }
    }

    private async compileGBNF(gbnfContent: string): Promise<string> {
        // Convert GBNF to LLguidance format
        // This would use LLguidance's GBNF parser
        Logger.debug('Compiling GBNF grammar to LLguidance format')
        
        // Placeholder implementation
        // In reality, this would call LLguidance's native compilation
        return gbnfContent // Simplified
    }

    private async compileJsonSchema(jsonSchema: string): Promise<string> {
        try {
            const schema = JSON.parse(jsonSchema)
            Logger.debug('Compiling JSON schema to LLguidance format')
            
            // Convert JSON schema to LLguidance grammar
            // This would use LLguidance's JSON schema compiler
            return JSON.stringify(schema) // Placeholder
        } catch (error) {
            throw new Error(`Invalid JSON schema: ${error}`)
        }
    }

    private async compileRegex(pattern: string): Promise<string> {
        Logger.debug('Compiling regex pattern to LLguidance format')
        
        // Convert regex to LLguidance grammar
        // This would use LLguidance's regex compiler
        return pattern // Placeholder
    }

    async generateWithGrammar(
        prompt: string, 
        grammarConfig: LLguidanceConfig,
        modelHandle: any // Model instance from current pipeline
    ): Promise<LLguidanceResponse> {
        if (!this.isInitialized) {
            throw new Error('LLguidance engine not initialized')
        }

        const startTime = Date.now()

        try {
            // Compile grammar
            const compiledGrammar = await this.compileGrammar(grammarConfig)
            
            // Set up LLguidance generation parameters
            const generationParams = {
                prompt,
                grammar: compiledGrammar,
                temperature: grammarConfig.temperature ?? 0.7,
                maxTokens: grammarConfig.maxTokens ?? 150,
                stopSequences: grammarConfig.stopSequences ?? [],
            }

            Logger.debug('Starting LLguidance generation', generationParams)

            // Perform guided generation
            const result = await this.performGuidedGeneration(
                modelHandle, 
                generationParams
            )

            const executionTime = Date.now() - startTime

            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    executionTime,
                }
            }
        } catch (error) {
            Logger.error(`LLguidance generation failed: ${error}`)
            throw error
        }
    }

    private async performGuidedGeneration(
        modelHandle: any,
        params: any
    ): Promise<LLguidanceResponse> {
        // This is where the actual LLguidance generation would happen
        // It would integrate with your existing model pipeline
        
        Logger.debug('Performing guided generation with LLguidance')
        
        // Placeholder implementation
        // In reality, this would call LLguidance's generation functions
        return {
            text: "Generated text with grammar constraints",
            tokens: [1, 2, 3, 4, 5],
            finishReason: 'grammar',
            metadata: {
                grammarSteps: 10,
                cacheHits: 2,
                executionTime: 0, // Will be set by caller
            }
        }
    }

    validateGrammar(grammarType: string, content: string): { valid: boolean, errors: string[] } {
        const errors: string[] = []

        try {
            switch (grammarType) {
                case 'gbnf':
                    return this.validateGBNF(content)
                case 'json-schema':
                    return this.validateJsonSchema(content)
                case 'regex':
                    return this.validateRegex(content)
                default:
                    errors.push(`Unknown grammar type: ${grammarType}`)
                    return { valid: false, errors }
            }
        } catch (error) {
            errors.push(`Validation error: ${error}`)
            return { valid: false, errors }
        }
    }

    private validateGBNF(content: string): { valid: boolean, errors: string[] } {
        const errors: string[] = []
        
        // Basic GBNF validation
        if (!content.includes('::=')) {
            errors.push('GBNF grammar must contain rule definitions (::=)')
        }

        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line && !line.startsWith('#') && line.length > 0) {
                if (!line.includes('::=') && !line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*$/)) {
                    errors.push(`Line ${i + 1}: Invalid GBNF syntax`)
                }
            }
        }

        return { valid: errors.length === 0, errors }
    }

    private validateJsonSchema(content: string): { valid: boolean, errors: string[] } {
        const errors: string[] = []
        
        try {
            const schema = JSON.parse(content)
            if (!schema.type) {
                errors.push('JSON schema must have a "type" property')
            }
        } catch (error) {
            errors.push(`Invalid JSON: ${error}`)
        }

        return { valid: errors.length === 0, errors }
    }

    private validateRegex(content: string): { valid: boolean, errors: string[] } {
        const errors: string[] = []
        
        try {
            new RegExp(content)
        } catch (error) {
            errors.push(`Invalid regex pattern: ${error}`)
        }

        return { valid: errors.length === 0, errors }
    }

    clearCache(): void {
        this.grammarCache.clear()
        Logger.debug('LLguidance grammar cache cleared')
    }

    getStats() {
        return {
            initialized: this.isInitialized,
            cachedGrammars: this.grammarCache.size,
        }
    }
}