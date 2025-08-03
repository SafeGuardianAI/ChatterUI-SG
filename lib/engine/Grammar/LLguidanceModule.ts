import { NativeModules, Platform } from 'react-native'
import { Logger } from '@lib/state/Logger'

/**
 * React Native bridge to LLguidance native module
 * Provides fallback implementation when native module is not available
 */

interface LLguidanceNativeBridge {
    initialize(): Promise<boolean>
    isAvailable(): Promise<boolean>
    compileGrammar(
        grammarType: string,
        grammarContent: string,
        options: string
    ): Promise<string>
    validateGrammar(grammarType: string, grammarContent: string): Promise<string>
    generateWithGrammar(
        modelHandle: string,
        grammarId: string,
        prompt: string,
        options: string
    ): Promise<string>
    releaseGrammar(grammarId: string): Promise<boolean>
    getStats(): Promise<string>
    clearAll(): Promise<boolean>
}

class LLguidanceModuleFallback implements LLguidanceNativeBridge {
    async initialize(): Promise<boolean> {
        Logger.debug('LLguidance fallback: initialize()')
        return false // Fallback always reports as unavailable
    }

    async isAvailable(): Promise<boolean> {
        return false
    }

    async compileGrammar(grammarType: string, grammarContent: string, options: string): Promise<string> {
        throw new Error('LLguidance native module not available - using fallback GBNF')
    }

    async validateGrammar(grammarType: string, grammarContent: string): Promise<string> {
        // Basic validation fallback
        try {
            if (grammarType === 'json-schema') {
                JSON.parse(grammarContent) // Will throw if invalid JSON
                return JSON.stringify({ valid: true, errors: [], warnings: ['Using fallback validation'] })
            } else if (grammarType === 'gbnf') {
                const hasRules = grammarContent.includes('::=')
                return JSON.stringify({ 
                    valid: hasRules, 
                    errors: hasRules ? [] : ['No GBNF rules found'],
                    warnings: ['Using fallback validation']
                })
            }
            return JSON.stringify({ valid: false, errors: ['Unsupported grammar type'], warnings: [] })
        } catch (error) {
            return JSON.stringify({ valid: false, errors: [`Validation error: ${error}`], warnings: [] })
        }
    }

    async generateWithGrammar(modelHandle: string, grammarId: string, prompt: string, options: string): Promise<string> {
        throw new Error('LLguidance native module not available - using fallback GBNF')
    }

    async releaseGrammar(grammarId: string): Promise<boolean> {
        return true // No-op for fallback
    }

    async getStats(): Promise<string> {
        return JSON.stringify({
            grammarsCompiled: 0,
            totalGeneration: 0,
            cacheHits: 0,
            averageTime: 0,
            engineType: 'fallback'
        })
    }

    async clearAll(): Promise<boolean> {
        return true // No-op for fallback
    }
}

/**
 * LLguidance React Native Module
 * Automatically detects and uses native implementation or falls back
 */
class LLguidanceReactNativeModule {
    private bridge: LLguidanceNativeBridge
    private isNativeAvailable: boolean = false

    constructor() {
        try {
            // Try to get the native module
            const nativeModule = NativeModules.LLguidanceModule as LLguidanceNativeBridge
            
            if (nativeModule && typeof nativeModule.initialize === 'function') {
                this.bridge = nativeModule
                this.isNativeAvailable = true
                Logger.info('🚀 LLguidance NATIVE MODULE DETECTED - High-performance grammar processing available')
                Logger.info(`📱 Platform: ${this.platformInfo}`)
            } else {
                throw new Error('Native module not properly exported')
            }
        } catch (error) {
            Logger.warn('⚠️  LLguidance native module NOT AVAILABLE - Using GBNF fallback system')
            Logger.warn(`🔧 Reason: ${error.message}`)
            Logger.info(`📱 Platform: ${this.platformInfo}`)
            this.bridge = new LLguidanceModuleFallback()
            this.isNativeAvailable = false
        }
    }

    /**
     * Check if the native module is available
     */
    get isNative(): boolean {
        return this.isNativeAvailable
    }

    /**
     * Get platform information
     */
    get platformInfo(): string {
        return `${Platform.OS} ${Platform.Version} (Native: ${this.isNativeAvailable})`
    }

    // Proxy all methods to the bridge
    async initialize(): Promise<boolean> {
        try {
            const result = await this.bridge.initialize()
            if (result) {
                Logger.info(`🎯 LLguidance module initialized successfully (Native: ${this.isNativeAvailable})`)
            } else {
                Logger.warn(`❌ LLguidance module initialization failed (Native: ${this.isNativeAvailable})`)
            }
            return result
        } catch (error) {
            Logger.error('LLguidance initialize failed:', error)
            return false
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            return await this.bridge.isAvailable()
        } catch (error) {
            Logger.warn('LLguidance isAvailable check failed:', error)
            return false
        }
    }

    async compileGrammar(grammarType: string, grammarContent: string, options: any = {}): Promise<string> {
        try {
            const optionsStr = JSON.stringify(options)
            return await this.bridge.compileGrammar(grammarType, grammarContent, optionsStr)
        } catch (error) {
            Logger.error('LLguidance compileGrammar failed:', error)
            throw error
        }
    }

    async validateGrammar(grammarType: string, grammarContent: string): Promise<{
        valid: boolean
        errors: string[]
        warnings: string[]
    }> {
        try {
            const resultStr = await this.bridge.validateGrammar(grammarType, grammarContent)
            return JSON.parse(resultStr)
        } catch (error) {
            Logger.error('LLguidance validateGrammar failed:', error)
            return {
                valid: false,
                errors: [`Validation failed: ${error.message}`],
                warnings: []
            }
        }
    }

    async generateWithGrammar(
        modelHandle: string,
        grammarId: string,
        prompt: string,
        options: any = {}
    ): Promise<{
        text: string
        tokens?: number[]
        logprobs?: number[]
        finishReason: string
        metadata?: any
    }> {
        try {
            const optionsStr = JSON.stringify(options)
            const resultStr = await this.bridge.generateWithGrammar(modelHandle, grammarId, prompt, optionsStr)
            return JSON.parse(resultStr)
        } catch (error) {
            Logger.error('LLguidance generateWithGrammar failed:', error)
            throw error
        }
    }

    async releaseGrammar(grammarId: string): Promise<boolean> {
        try {
            return await this.bridge.releaseGrammar(grammarId)
        } catch (error) {
            Logger.warn('LLguidance releaseGrammar failed:', error)
            return false
        }
    }

    async getStats(): Promise<{
        grammarsCompiled: number
        totalGeneration: number
        cacheHits: number
        averageTime: number
        engineType: string
    }> {
        try {
            const statsStr = await this.bridge.getStats()
            return JSON.parse(statsStr)
        } catch (error) {
            Logger.warn('LLguidance getStats failed:', error)
            return {
                grammarsCompiled: 0,
                totalGeneration: 0,
                cacheHits: 0,
                averageTime: 0,
                engineType: 'fallback'
            }
        }
    }

    async clearAll(): Promise<boolean> {
        try {
            return await this.bridge.clearAll()
        } catch (error) {
            Logger.warn('LLguidance clearAll failed:', error)
            return false
        }
    }
}

// Export singleton instance
export const LLguidanceModule = new LLguidanceReactNativeModule()

// Re-export for compatibility
export default LLguidanceModule