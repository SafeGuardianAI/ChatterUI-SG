/**
 * LLguidance Native Module Interface
 * 
 * This file defines the interface for the LLguidance native module.
 * The actual implementation would be in native code (iOS/Android).
 */

export interface LLguidanceNativeModule {
    /**
     * Initialize the LLguidance engine
     * @returns Promise<boolean> - true if initialization successful
     */
    initialize(): Promise<boolean>

    /**
     * Check if LLguidance is available on this platform
     * @returns Promise<boolean> - true if available
     */
    isAvailable(): Promise<boolean>

    /**
     * Compile a grammar string into LLguidance format
     * @param grammarType - Type of grammar ('gbnf', 'json-schema', 'regex')
     * @param grammarContent - The grammar content to compile
     * @param options - Compilation options
     * @returns Promise<string> - Compiled grammar ID or error
     */
    compileGrammar(
        grammarType: 'gbnf' | 'json-schema' | 'regex',
        grammarContent: string,
        options?: {
            enableOptimization?: boolean
            debugMode?: boolean
        }
    ): Promise<string>

    /**
     * Validate a grammar without compiling
     * @param grammarType - Type of grammar
     * @param grammarContent - The grammar content to validate
     * @returns Promise<{valid: boolean, errors: string[]}> - Validation result
     */
    validateGrammar(
        grammarType: 'gbnf' | 'json-schema' | 'regex',
        grammarContent: string
    ): Promise<{
        valid: boolean
        errors: string[]
        warnings?: string[]
    }>

    /**
     * Perform guided generation using a compiled grammar
     * @param modelHandle - Reference to the loaded model
     * @param grammarId - ID of the compiled grammar
     * @param prompt - Input prompt
     * @param options - Generation options
     * @returns Promise<GenerationResult> - Generation result
     */
    generateWithGrammar(
        modelHandle: any,
        grammarId: string,
        prompt: string,
        options: {
            temperature?: number
            maxTokens?: number
            stopSequences?: string[]
            seed?: number
        }
    ): Promise<{
        text: string
        tokens: number[]
        logprobs?: number[]
        finishReason: 'length' | 'stop' | 'grammar' | 'error'
        metadata: {
            grammarSteps: number
            executionTime: number
            tokensPerSecond: number
        }
    }>

    /**
     * Release a compiled grammar from memory
     * @param grammarId - ID of the grammar to release
     * @returns Promise<boolean> - true if successful
     */
    releaseGrammar(grammarId: string): Promise<boolean>

    /**
     * Get statistics about the LLguidance engine
     * @returns Promise<LLguidanceStats> - Engine statistics
     */
    getStats(): Promise<{
        compiledGrammars: number
        totalGenerations: number
        averageGenerationTime: number
        memoryUsage: number
        version: string
    }>

    /**
     * Clear all compiled grammars and reset engine state
     * @returns Promise<boolean> - true if successful
     */
    clearAll(): Promise<boolean>
}

/**
 * React Native bridge implementation
 * This would be implemented as a native module
 */
import { NativeModules } from 'react-native'

// Native module interface (would be implemented in native code)
interface LLguidanceNativeBridge {
    initialize(): Promise<boolean>
    isAvailable(): Promise<boolean>
    compileGrammar(
        grammarType: string,
        grammarContent: string,
        options: string // JSON stringified options
    ): Promise<string>
    validateGrammar(grammarType: string, grammarContent: string): Promise<string> // JSON result
    generateWithGrammar(
        modelHandle: string,
        grammarId: string,
        prompt: string,
        options: string // JSON stringified options
    ): Promise<string> // JSON result
    releaseGrammar(grammarId: string): Promise<boolean>
    getStats(): Promise<string> // JSON result
    clearAll(): Promise<boolean>
}

/**
 * TypeScript wrapper for the native module
 */
export class LLguidanceNative implements LLguidanceNativeModule {
    private bridge: LLguidanceNativeBridge | null = null

    constructor() {
        // Try to get the native module
        try {
            this.bridge = NativeModules.LLguidanceModule as LLguidanceNativeBridge
        } catch (error) {
            console.warn('LLguidance native module not available:', error)
            this.bridge = null
        }
    }

    async initialize(): Promise<boolean> {
        if (!this.bridge) return false
        
        try {
            return await this.bridge.initialize()
        } catch (error) {
            console.error('LLguidance initialization failed:', error)
            return false
        }
    }

    async isAvailable(): Promise<boolean> {
        if (!this.bridge) return false
        
        try {
            return await this.bridge.isAvailable()
        } catch (error) {
            console.debug('LLguidance availability check failed:', error)
            return false
        }
    }

    async compileGrammar(
        grammarType: 'gbnf' | 'json-schema' | 'regex',
        grammarContent: string,
        options: {
            enableOptimization?: boolean
            debugMode?: boolean
        } = {}
    ): Promise<string> {
        if (!this.bridge) {
            throw new Error('LLguidance native module not available')
        }

        try {
            const optionsJson = JSON.stringify(options)
            return await this.bridge.compileGrammar(grammarType, grammarContent, optionsJson)
        } catch (error) {
            throw new Error(`Grammar compilation failed: ${error}`)
        }
    }

    async validateGrammar(
        grammarType: 'gbnf' | 'json-schema' | 'regex',
        grammarContent: string
    ): Promise<{
        valid: boolean
        errors: string[]
        warnings?: string[]
    }> {
        if (!this.bridge) {
            // Fallback validation
            return {
                valid: true,
                errors: [],
                warnings: ['LLguidance not available, using basic validation']
            }
        }

        try {
            const resultJson = await this.bridge.validateGrammar(grammarType, grammarContent)
            return JSON.parse(resultJson)
        } catch (error) {
            return {
                valid: false,
                errors: [`Validation failed: ${error}`]
            }
        }
    }

    async generateWithGrammar(
        modelHandle: any,
        grammarId: string,
        prompt: string,
        options: {
            temperature?: number
            maxTokens?: number
            stopSequences?: string[]
            seed?: number
        }
    ): Promise<{
        text: string
        tokens: number[]
        logprobs?: number[]
        finishReason: 'length' | 'stop' | 'grammar' | 'error'
        metadata: {
            grammarSteps: number
            executionTime: number
            tokensPerSecond: number
        }
    }> {
        if (!this.bridge) {
            throw new Error('LLguidance native module not available')
        }

        try {
            const modelHandleStr = String(modelHandle) // Convert to string for native bridge
            const optionsJson = JSON.stringify(options)
            
            const resultJson = await this.bridge.generateWithGrammar(
                modelHandleStr,
                grammarId,
                prompt,
                optionsJson
            )
            
            return JSON.parse(resultJson)
        } catch (error) {
            throw new Error(`Generation failed: ${error}`)
        }
    }

    async releaseGrammar(grammarId: string): Promise<boolean> {
        if (!this.bridge) return true // Nothing to release

        try {
            return await this.bridge.releaseGrammar(grammarId)
        } catch (error) {
            console.warn(`Failed to release grammar ${grammarId}:`, error)
            return false
        }
    }

    async getStats(): Promise<{
        compiledGrammars: number
        totalGenerations: number
        averageGenerationTime: number
        memoryUsage: number
        version: string
    }> {
        if (!this.bridge) {
            return {
                compiledGrammars: 0,
                totalGenerations: 0,
                averageGenerationTime: 0,
                memoryUsage: 0,
                version: 'not_available'
            }
        }

        try {
            const statsJson = await this.bridge.getStats()
            return JSON.parse(statsJson)
        } catch (error) {
            console.warn('Failed to get LLguidance stats:', error)
            return {
                compiledGrammars: 0,
                totalGenerations: 0,
                averageGenerationTime: 0,
                memoryUsage: 0,
                version: 'error'
            }
        }
    }

    async clearAll(): Promise<boolean> {
        if (!this.bridge) return true

        try {
            return await this.bridge.clearAll()
        } catch (error) {
            console.warn('Failed to clear LLguidance:', error)
            return false
        }
    }
}

/**
 * Platform-specific implementation notes:
 * 
 * iOS Implementation (Objective-C/Swift):
 * - Link against LLguidance C++ library
 * - Implement LLguidanceModule as RCTBridgeModule
 * - Use NSString, NSArray, NSDictionary for data passing
 * - Handle async operations with RCTPromiseResolveBlock/RCTPromiseRejectBlock
 * 
 * Android Implementation (Java/Kotlin):
 * - Link against LLguidance C++ library via JNI
 * - Implement LLguidanceModule extends ReactContextBaseJavaModule
 * - Use Promise<> for async returns
 * - Handle JSON serialization for complex data types
 * 
 * Example CMake setup for native linking:
 * ```cmake
 * find_package(llguidance REQUIRED)
 * target_link_libraries(${PROJECT_NAME} llguidance::llguidance)
 * ```
 * 
 * Package.json native dependencies:
 * ```json
 * {
 *   "dependencies": {
 *     "llguidance": "^0.1.0"
 *   }
 * }
 * ```
 */

// Export singleton instance
export const LLguidanceNativeInstance = new LLguidanceNative()