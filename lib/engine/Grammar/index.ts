// Grammar Engine Integration Export
export { GrammarInference, GrammarSettings } from './GrammarInference'
export { GrammarPipeline } from './GrammarPipeline'
export { LLguidanceEngine } from './LLguidanceEngine'

// Types
export type { GrammarEngineType } from './GrammarInference'
export type { LLguidanceConfig, LLguidanceResponse } from './LLguidanceEngine'
export type { GrammarRequest, GrammarResult } from './GrammarPipeline'

/**
 * Easy integration helper for existing components
 */
import { GrammarInference } from './GrammarInference'
import { Logger } from '@lib/state/Logger'

export class GrammarHelper {
    /**
     * Simple wrapper for grammar-constrained generation
     * Drop-in replacement for existing grammar functions
     */
    static async generateWithGrammar(
        prompt: string,
        grammarString: string,
        options: {
            temperature?: number
            maxTokens?: number
            stopSequences?: string[]
        } = {}
    ): Promise<string> {
        try {
            const grammarInference = GrammarInference.getInstance()
            
            // Auto-detect grammar type
            const grammarType = this.detectGrammarType(grammarString)
            
            const result = await grammarInference.generateWithGrammar(
                prompt,
                grammarString,
                grammarType,
                options
            )

            if (!result.success) {
                throw new Error(result.error || 'Grammar generation failed')
            }

            Logger.debug(`Grammar generation completed using ${result.engine} engine`)
            return result.text
        } catch (error) {
            Logger.error(`Grammar generation failed: ${error}`)
            throw error
        }
    }

    /**
     * Validate grammar before use
     */
    static validateGrammar(grammarString: string): { valid: boolean, errors: string[] } {
        try {
            const grammarInference = GrammarInference.getInstance()
            const grammarType = this.detectGrammarType(grammarString)
            
            return grammarInference.validateGrammar(grammarType, grammarString)
        } catch (error) {
            return {
                valid: false,
                errors: [`Validation error: ${error}`]
            }
        }
    }

    /**
     * Auto-detect grammar type based on content
     */
    private static detectGrammarType(grammarString: string): 'gbnf' | 'json-schema' | 'regex' {
        // Check if it's JSON schema
        try {
            const parsed = JSON.parse(grammarString)
            if (parsed.type || parsed.properties || parsed.$schema) {
                return 'json-schema'
            }
        } catch {
            // Not JSON
        }

        // Check if it's GBNF
        if (grammarString.includes('::=')) {
            return 'gbnf'
        }

        // Check if it's a regex pattern
        if (grammarString.startsWith('/') && grammarString.endsWith('/')) {
            return 'regex'
        }

        // Default to GBNF
        return 'gbnf'
    }

    /**
     * Get recommended engine for a grammar
     */
    static async getRecommendedEngine(grammarString: string): Promise<'gbnf' | 'llguidance'> {
        try {
            const grammarInference = GrammarInference.getInstance()
            const grammarType = this.detectGrammarType(grammarString)
            
            // Run a quick benchmark
            const benchmark = await grammarInference.benchmarkEngines(
                'Test prompt',
                grammarString,
                grammarType,
                1 // Single iteration for quick recommendation
            )
            
            return benchmark.recommendation === 'auto' ? 'gbnf' : benchmark.recommendation
        } catch (error) {
            Logger.debug(`Could not determine recommended engine: ${error}`)
            return 'gbnf' // Safe fallback
        }
    }
}

/**
 * React hook for grammar engine management
 */
import { useState, useEffect } from 'react'

export function useGrammarEngine() {
    const [isInitialized, setIsInitialized] = useState(false)
    const [currentEngine, setCurrentEngine] = useState<string>('gbnf')
    const [llguidanceAvailable, setLLguidanceAvailable] = useState<boolean | null>(null)

    useEffect(() => {
        initializeGrammarEngine()
    }, [])

    const initializeGrammarEngine = async () => {
        try {
            const grammarInference = GrammarInference.getInstance()
            await grammarInference.initialize()
            
            const config = grammarInference.getCurrentConfiguration()
            setCurrentEngine(config.engine)
            
            const available = await grammarInference.isLLguidanceAvailable()
            setLLguidanceAvailable(available)
            
            setIsInitialized(true)
        } catch (error) {
            Logger.error(`Failed to initialize grammar engine: ${error}`)
        }
    }

    const generateWithGrammar = async (
        prompt: string,
        grammar: string,
        options?: { temperature?: number; maxTokens?: number }
    ) => {
        return GrammarHelper.generateWithGrammar(prompt, grammar, options)
    }

    const validateGrammar = (grammar: string) => {
        return GrammarHelper.validateGrammar(grammar)
    }

    const updateEngine = (engine: 'gbnf' | 'llguidance' | 'auto') => {
        const grammarInference = GrammarInference.getInstance()
        grammarInference.updateConfiguration({ engine })
        setCurrentEngine(engine)
    }

    return {
        isInitialized,
        currentEngine,
        llguidanceAvailable,
        generateWithGrammar,
        validateGrammar,
        updateEngine,
    }
}