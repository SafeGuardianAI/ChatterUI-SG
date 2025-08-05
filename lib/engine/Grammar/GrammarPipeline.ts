import { Logger } from '@lib/state/Logger'
import { LLguidanceEngine, LLguidanceConfig, LLguidanceResponse } from './LLguidanceEngine'
import { convertJsonSchemaToGrammar } from 'cui-llama.rn'

export type GrammarEngine = 'gbnf' | 'llguidance' | 'auto'

export interface GrammarPipelineConfig {
    engine: GrammarEngine
    fallbackEngine?: GrammarEngine
    enableCaching: boolean
    debugMode: boolean
    preferredEngine?: GrammarEngine
}

export interface GrammarRequest {
    grammarContent: string
    grammarType: 'gbnf' | 'json-schema' | 'regex'
    prompt: string
    temperature?: number
    maxTokens?: number
    stopSequences?: string[]
}

export interface GrammarResult {
    text: string
    engine: GrammarEngine
    success: boolean
    executionTime: number
    metadata?: any
    error?: string
}

export class GrammarPipeline {
    private static instance: GrammarPipeline | null = null
    private llguidance: LLguidanceEngine
    private config: GrammarPipelineConfig
    private performanceStats = new Map<GrammarEngine, {
        totalRequests: number
        successfulRequests: number
        averageTime: number
        lastUsed: number
    }>()

    constructor(config: GrammarPipelineConfig) {
        this.config = config
        this.llguidance = LLguidanceEngine.getInstance()
        this.initializePerformanceTracking()
    }

    static async create(config: GrammarPipelineConfig): Promise<GrammarPipeline> {
        if (!this.instance) {
            this.instance = new GrammarPipeline(config)
            await this.instance.initialize()
        }
        return this.instance
    }

    static getInstance(): GrammarPipeline {
        if (!this.instance) {
            throw new Error('GrammarPipeline not initialized. Call GrammarPipeline.create() first.')
        }
        return this.instance
    }

    private async initialize(): Promise<void> {
        Logger.info('Initializing Grammar Pipeline')
        
        // Initialize LLguidance if it's going to be used
        if (this.config.engine === 'llguidance' || this.config.engine === 'auto') {
            const llguidanceAvailable = await this.llguidance.initialize()
            if (!llguidanceAvailable && this.config.engine === 'llguidance') {
                Logger.warn('LLguidance not available, falling back to GBNF')
                this.config.engine = 'gbnf'
            }
        }

        Logger.info(`Grammar Pipeline initialized with engine: ${this.config.engine}`)
    }

    private initializePerformanceTracking(): void {
        const engines: GrammarEngine[] = ['gbnf', 'llguidance']
        engines.forEach(engine => {
            this.performanceStats.set(engine, {
                totalRequests: 0,
                successfulRequests: 0,
                averageTime: 0,
                lastUsed: 0
            })
        })
    }

    async processGrammarRequest(
        request: GrammarRequest,
        modelHandle: any
    ): Promise<GrammarResult> {
        const startTime = Date.now()
        
        try {
            // Determine which engine to use
            const engine = await this.selectEngine(request)
            const engineReason = await this.getEngineSelectionReason(engine, request)
            
            // Enhanced inference-time logging
            Logger.info(`🔥 INFERENCE START: Using ${engine.toUpperCase()} engine for grammar processing`)
            Logger.info(`📋 Grammar Type: ${request.grammarType} | Reason: ${engineReason}`)
            Logger.debug(`📝 Grammar Preview: ${request.grammarContent.substring(0, 100)}${request.grammarContent.length > 100 ? '...' : ''}`)

            let result: GrammarResult

            switch (engine) {
                case 'llguidance':
                    Logger.info(`⚡ Processing with LLguidance engine...`)
                    result = await this.processWithLLguidance(request, modelHandle)
                    break
                case 'gbnf':
                    Logger.info(`🔧 Processing with traditional GBNF engine...`)
                    result = await this.processWithGBNF(request, modelHandle)
                    break
                default:
                    throw new Error(`Unsupported engine: ${engine}`)
            }

            // Update performance stats
            const executionTime = Date.now() - startTime
            this.updatePerformanceStats(engine, true, executionTime)
            
            // Enhanced completion logging
            Logger.info(`✅ INFERENCE COMPLETE: ${engine.toUpperCase()} engine | ${executionTime}ms | ${result.text.length} chars generated`)
            Logger.debug(`📊 Generated text preview: ${result.text.substring(0, 200)}${result.text.length > 200 ? '...' : ''}`)
            
            return {
                ...result,
                engine,
                success: true,
                executionTime
            }

        } catch (error) {
            const errorMsg = `Grammar processing failed: ${error}`
            Logger.error(errorMsg)

            // Try fallback engine if configured
            if (this.config.fallbackEngine && this.config.fallbackEngine !== this.config.engine) {
                Logger.info(`Attempting fallback to ${this.config.fallbackEngine}`)
                try {
                    const fallbackResult = await this.processWithFallback(request, modelHandle)
                    return {
                        ...fallbackResult,
                        success: true,
                        executionTime: Date.now() - startTime
                    }
                } catch (fallbackError) {
                    Logger.error(`Fallback also failed: ${fallbackError}`)
                }
            }

            return {
                text: '',
                engine: this.config.engine,
                success: false,
                executionTime: Date.now() - startTime,
                error: errorMsg
            }
        }
    }

    private async selectEngine(request: GrammarRequest): Promise<GrammarEngine> {
        if (this.config.engine !== 'auto') {
            return this.config.engine
        }

        // Auto-selection logic
        const stats = this.performanceStats

        // Prefer LLguidance for complex grammars
        if (this.isComplexGrammar(request)) {
            if (stats.get('llguidance')?.successfulRequests ?? 0 > 0) {
                return 'llguidance'
            }
        }

        // Use performance-based selection
        const gbnfStats = stats.get('gbnf')!
        const llguidanceStats = stats.get('llguidance')!

        if (gbnfStats.averageTime < llguidanceStats.averageTime) {
            return 'gbnf'
        }

        return this.config.preferredEngine ?? 'gbnf'
    }

    private isComplexGrammar(request: GrammarRequest): boolean {
        // Determine if grammar is complex enough to benefit from LLguidance
        if (request.grammarType === 'json-schema') {
            try {
                const schema = JSON.parse(request.grammarContent)
                // Complex if it has nested objects or arrays
                return this.hasNestedStructures(schema)
            } catch {
                return false
            }
        }

        if (request.grammarType === 'gbnf') {
            // Complex if it has many rules
            const rules = request.grammarContent.split('::=').length - 1
            return rules > 10
        }

        return false
    }

    private hasNestedStructures(obj: any, depth = 0): boolean {
        if (depth > 2) return true
        
        if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
                if (obj[key] && typeof obj[key] === 'object') {
                    if (this.hasNestedStructures(obj[key], depth + 1)) {
                        return true
                    }
                }
            }
        }
        
        return false
    }

    private async getEngineSelectionReason(engine: GrammarEngine, request: GrammarRequest): Promise<string> {
        // Explain why this engine was selected for debugging/monitoring
        if (this.config.engine !== 'auto') {
            return `Manual selection (config: ${this.config.engine})`
        }

        const isLLguidanceAvailable = await this.llguidance.isLLguidanceAvailable()
        
        if (!isLLguidanceAvailable) {
            return `LLguidance unavailable, using GBNF fallback`
        }

        if (engine === 'llguidance') {
            if (this.isComplexGrammar(request)) {
                return `Complex grammar detected, using LLguidance for better performance`
            } else {
                return `LLguidance available and performing well`
            }
        } else {
            if (this.isComplexGrammar(request)) {
                return `Complex grammar but GBNF selected due to performance metrics`
            } else {
                return `Simple grammar, GBNF is efficient`
            }
        }
    }

    private async processWithLLguidance(
        request: GrammarRequest,
        modelHandle: any
    ): Promise<Omit<GrammarResult, 'engine' | 'success' | 'executionTime'>> {
        const llguidanceConfig: LLguidanceConfig = {
            grammarType: request.grammarType === 'gbnf' ? 'gbnf' : 
                        request.grammarType === 'json-schema' ? 'json-schema' : 'regex',
            grammarContent: request.grammarContent,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            stopSequences: request.stopSequences,
            enableCache: this.config.enableCaching,
            debugMode: this.config.debugMode
        }

        const response = await this.llguidance.generateWithGrammar(
            request.prompt,
            llguidanceConfig,
            modelHandle
        )

        return {
            text: response.text,
            metadata: {
                ...response.metadata,
                tokens: response.tokens,
                finishReason: response.finishReason
            }
        }
    }

    private async processWithGBNF(
        request: GrammarRequest,
        modelHandle: any
    ): Promise<Omit<GrammarResult, 'engine' | 'success' | 'executionTime'>> {
        // Use existing GBNF pipeline
        let grammarString = request.grammarContent

        // Convert JSON schema to GBNF if needed
        if (request.grammarType === 'json-schema') {
            try {
                const schema = JSON.parse(request.grammarContent)
                grammarString = await convertJsonSchemaToGrammar(schema)
            } catch (error) {
                throw new Error(`JSON schema conversion failed: ${error}`)
            }
        }

        // Apply grammar to model (this would integrate with your existing model pipeline)
        const result = await this.generateWithExistingPipeline(
            request.prompt,
            grammarString,
            modelHandle,
            {
                temperature: request.temperature,
                maxTokens: request.maxTokens,
                stopSequences: request.stopSequences
            }
        )

        return {
            text: result.text,
            metadata: {
                grammarUsed: grammarString.length > 0,
                method: 'gbnf'
            }
        }
    }

    private async generateWithExistingPipeline(
        prompt: string,
        grammar: string,
        modelHandle: any,
        options: any
    ): Promise<{ text: string }> {
        // This would integrate with your existing local inference pipeline
        // For now, it's a placeholder that represents the current GBNF generation
        
        Logger.debug('Generating with existing GBNF pipeline')
        
        // This should call your existing Llama generation with grammar
        // e.g., modelHandle.generateWithGrammar(prompt, grammar, options)
        
        return {
            text: "Generated text using existing GBNF pipeline" // Placeholder
        }
    }

    private async processWithFallback(
        request: GrammarRequest,
        modelHandle: any
    ): Promise<Omit<GrammarResult, 'success' | 'executionTime'>> {
        const fallbackEngine = this.config.fallbackEngine!
        
        if (fallbackEngine === 'gbnf') {
            const result = await this.processWithGBNF(request, modelHandle)
            return { ...result, engine: fallbackEngine }
        } else {
            const result = await this.processWithLLguidance(request, modelHandle)
            return { ...result, engine: fallbackEngine }
        }
    }

    private updatePerformanceStats(engine: GrammarEngine, success: boolean, executionTime: number): void {
        const stats = this.performanceStats.get(engine)!
        
        stats.totalRequests++
        if (success) {
            stats.successfulRequests++
        }
        
        // Update running average
        const totalTime = stats.averageTime * (stats.totalRequests - 1) + executionTime
        stats.averageTime = totalTime / stats.totalRequests
        stats.lastUsed = Date.now()
        
        this.performanceStats.set(engine, stats)
    }

    validateGrammar(grammarType: string, content: string): { valid: boolean, errors: string[] } {
        // Use LLguidance validation if available, otherwise fall back to basic validation
        if (this.llguidance.getStats().initialized) {
            return this.llguidance.validateGrammar(grammarType, content)
        }

        // Basic validation fallback
        return this.basicGrammarValidation(grammarType, content)
    }

    private basicGrammarValidation(grammarType: string, content: string): { valid: boolean, errors: string[] } {
        const errors: string[] = []

        if (!content.trim()) {
            errors.push('Grammar content cannot be empty')
            return { valid: false, errors }
        }

        switch (grammarType) {
            case 'gbnf':
                if (!content.includes('::=')) {
                    errors.push('GBNF grammar must contain rule definitions (::=)')
                }
                break
            case 'json-schema':
                try {
                    const schema = JSON.parse(content)
                    if (!schema.type) {
                        errors.push('JSON schema must have a "type" property')
                    }
                } catch (error) {
                    errors.push(`Invalid JSON: ${error}`)
                }
                break
        }

        return { valid: errors.length === 0, errors }
    }

    getPerformanceStats() {
        const stats: any = {}
        this.performanceStats.forEach((value, key) => {
            stats[key] = {
                ...value,
                successRate: value.totalRequests > 0 ? 
                    (value.successfulRequests / value.totalRequests) * 100 : 0
            }
        })
        return stats
    }

    updateConfig(newConfig: Partial<GrammarPipelineConfig>): void {
        this.config = { ...this.config, ...newConfig }
        Logger.info('Grammar pipeline configuration updated', this.config)
    }

    clearCache(): void {
        this.llguidance.clearCache()
        Logger.debug('Grammar pipeline cache cleared')
    }
}