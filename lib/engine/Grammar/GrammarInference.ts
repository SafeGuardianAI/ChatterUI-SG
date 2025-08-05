import { GrammarPipeline, GrammarPipelineConfig, GrammarRequest } from './GrammarPipeline'
import { Llama } from '@lib/engine/Local/LlamaLocal'
import { Logger } from '@lib/state/Logger'
import { mmkv } from '@lib/storage/MMKV'

// Configuration keys for grammar engine selection
export const GrammarSettings = {
    Engine: 'grammar_engine',
    FallbackEngine: 'grammar_fallback_engine', 
    EnableCaching: 'grammar_enable_caching',
    DebugMode: 'grammar_debug_mode',
    PreferredEngine: 'grammar_preferred_engine',
    AutoSelectThreshold: 'grammar_auto_select_threshold'
} as const

export type GrammarEngineType = 'gbnf' | 'llguidance' | 'auto'

export class GrammarInference {
    private static instance: GrammarInference | null = null
    private pipeline: GrammarPipeline | null = null
    private initialized = false

    static getInstance(): GrammarInference {
        if (!this.instance) {
            this.instance = new GrammarInference()
        }
        return this.instance
    }

    async initialize(): Promise<void> {
        if (this.initialized) return

        try {
            const config = this.loadConfiguration()
            this.pipeline = await GrammarPipeline.create(config)
            this.initialized = true
            Logger.info('GrammarInference initialized successfully')
        } catch (error) {
            Logger.error(`Failed to initialize GrammarInference: ${error}`)
            throw error
        }
    }

    private loadConfiguration(): GrammarPipelineConfig {
        return {
            engine: (mmkv.getString(GrammarSettings.Engine) as GrammarEngineType) ?? 'auto',
            fallbackEngine: (mmkv.getString(GrammarSettings.FallbackEngine) as GrammarEngineType) ?? 'gbnf',
            enableCaching: mmkv.getBoolean(GrammarSettings.EnableCaching) ?? true,
            debugMode: mmkv.getBoolean(GrammarSettings.DebugMode) ?? false,
            preferredEngine: (mmkv.getString(GrammarSettings.PreferredEngine) as GrammarEngineType) ?? 'gbnf'
        }
    }

    /**
     * Main method to generate text with grammar constraints
     * Integrates with existing Llama inference pipeline
     */
    async generateWithGrammar(
        prompt: string,
        grammarContent: string,
        grammarType: 'gbnf' | 'json-schema' | 'regex' = 'gbnf',
        options: {
            temperature?: number
            maxTokens?: number
            stopSequences?: string[]
        } = {}
    ): Promise<{
        text: string
        success: boolean
        engine: string
        executionTime: number
        metadata?: any
        error?: string
    }> {
        if (!this.initialized || !this.pipeline) {
            await this.initialize()
        }

        // Get current model handle from Llama engine
        const llamaState = Llama.useEngineData.getState()
        const modelHandle = llamaState.model

        if (!modelHandle) {
            throw new Error('No model loaded. Please load a model first.')
        }

        const request: GrammarRequest = {
            prompt,
            grammarContent,
            grammarType,
            temperature: options.temperature ?? 0.7,
            maxTokens: options.maxTokens ?? 150,
            stopSequences: options.stopSequences ?? []
        }

        try {
            const result = await this.pipeline!.processGrammarRequest(request, modelHandle)
            
            Logger.debug('Grammar generation completed', {
                engine: result.engine,
                success: result.success,
                textLength: result.text.length,
                executionTime: result.executionTime
            })

            return result
        } catch (error) {
            Logger.error(`Grammar generation failed: ${error}`)
            throw error
        }
    }

    /**
     * Validate grammar content before generation
     */
    validateGrammar(grammarType: string, content: string): { valid: boolean, errors: string[] } {
        if (!this.pipeline) {
            // Basic validation if pipeline not available
            const errors: string[] = []
            if (!content.trim()) {
                errors.push('Grammar content cannot be empty')
            }
            return { valid: errors.length === 0, errors }
        }

        return this.pipeline.validateGrammar(grammarType, content)
    }

    /**
     * Update grammar engine configuration
     */
    updateConfiguration(updates: {
        engine?: GrammarEngineType
        fallbackEngine?: GrammarEngineType
        enableCaching?: boolean
        debugMode?: boolean
        preferredEngine?: GrammarEngineType
    }): void {
        // Update persistent settings
        Object.entries(updates).forEach(([key, value]) => {
            switch (key) {
                case 'engine':
                    mmkv.set(GrammarSettings.Engine, value)
                    break
                case 'fallbackEngine':
                    mmkv.set(GrammarSettings.FallbackEngine, value)
                    break
                case 'enableCaching':
                    mmkv.set(GrammarSettings.EnableCaching, value)
                    break
                case 'debugMode':
                    mmkv.set(GrammarSettings.DebugMode, value)
                    break
                case 'preferredEngine':
                    mmkv.set(GrammarSettings.PreferredEngine, value)
                    break
            }
        })

        // Update pipeline configuration
        if (this.pipeline) {
            this.pipeline.updateConfig(updates as any)
        }

        Logger.info('Grammar configuration updated', updates)
    }

    /**
     * Get performance statistics for different engines
     */
    getPerformanceStats() {
        if (!this.pipeline) {
            return {}
        }
        return this.pipeline.getPerformanceStats()
    }

    /**
     * Get current configuration
     */
    getCurrentConfiguration(): GrammarPipelineConfig {
        return this.loadConfiguration()
    }

    /**
     * Clear grammar cache
     */
    clearCache(): void {
        if (this.pipeline) {
            this.pipeline.clearCache()
        }
        Logger.info('Grammar cache cleared')
    }

    /**
     * Check if LLguidance is available
     */
    async isLLguidanceAvailable(): Promise<boolean> {
        try {
            if (!this.pipeline) {
                await this.initialize()
            }
            
            // Try to initialize LLguidance engine
            const testConfig = {
                engine: 'llguidance' as const,
                enableCaching: false,
                debugMode: false
            }
            
            const testPipeline = await GrammarPipeline.create(testConfig)
            return true
        } catch (error) {
            Logger.debug(`LLguidance not available: ${error}`)
            return false
        }
    }

    /**
     * Benchmark different engines for a given grammar
     */
    async benchmarkEngines(
        prompt: string,
        grammarContent: string,
        grammarType: 'gbnf' | 'json-schema' | 'regex' = 'gbnf',
        iterations = 3
    ): Promise<{
        gbnf: { averageTime: number, successRate: number }
        llguidance: { averageTime: number, successRate: number }
        recommendation: GrammarEngineType
    }> {
        const results = {
            gbnf: { times: [] as number[], successes: 0 },
            llguidance: { times: [] as number[], successes: 0 }
        }

        // Test both engines
        for (const engine of ['gbnf', 'llguidance'] as const) {
            // Update configuration to use specific engine
            this.updateConfiguration({ engine, fallbackEngine: undefined })
            
            for (let i = 0; i < iterations; i++) {
                try {
                    const startTime = Date.now()
                    
                    await this.generateWithGrammar(
                        prompt,
                        grammarContent,
                        grammarType,
                        { maxTokens: 50 } // Short generation for benchmarking
                    )
                    
                    const executionTime = Date.now() - startTime
                    results[engine].times.push(executionTime)
                    results[engine].successes++
                } catch (error) {
                    Logger.debug(`${engine} benchmark iteration ${i} failed: ${error}`)
                    results[engine].times.push(Infinity) // Mark as failed
                }
            }
        }

        // Calculate averages and success rates
        const gbnfAvg = results.gbnf.times.filter(t => t !== Infinity).reduce((a, b) => a + b, 0) / results.gbnf.times.filter(t => t !== Infinity).length || Infinity
        const llguidanceAvg = results.llguidance.times.filter(t => t !== Infinity).reduce((a, b) => a + b, 0) / results.llguidance.times.filter(t => t !== Infinity).length || Infinity
        
        const gbnfSuccessRate = (results.gbnf.successes / iterations) * 100
        const llguidanceSuccessRate = (results.llguidance.successes / iterations) * 100

        // Determine recommendation
        let recommendation: GrammarEngineType = 'gbnf'
        if (llguidanceSuccessRate > gbnfSuccessRate) {
            recommendation = 'llguidance'
        } else if (llguidanceSuccessRate === gbnfSuccessRate && llguidanceAvg < gbnfAvg) {
            recommendation = 'llguidance'
        }

        // Restore auto configuration
        this.updateConfiguration({ engine: 'auto' })

        return {
            gbnf: { averageTime: gbnfAvg, successRate: gbnfSuccessRate },
            llguidance: { averageTime: llguidanceAvg, successRate: llguidanceSuccessRate },
            recommendation
        }
    }
}