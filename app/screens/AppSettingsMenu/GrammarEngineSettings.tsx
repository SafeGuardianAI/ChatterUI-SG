import ThemedButton from '@components/buttons/ThemedButton'
import DropdownSheet from '@components/input/DropdownSheet'
import ThemedSwitch from '@components/input/ThemedSwitch'
import SectionTitle from '@components/text/SectionTitle'
import TText from '@components/text/TText'
import Alert from '@components/views/Alert'
import { GrammarInference, GrammarSettings } from '@lib/engine/Grammar/GrammarInference'
import { Logger } from '@lib/state/Logger'
import { mmkv, useMMKVString, useMMKVBoolean, mmkvSync } from '@lib/storage/MMKV'
import { Theme } from '@lib/theme/ThemeManager'
import React, { useState, useEffect } from 'react'
import { View, StyleSheet } from 'react-native'

type GrammarEngineType = 'gbnf' | 'llguidance' | 'auto'

const engineOptions = [
    { label: 'Auto Select', value: 'auto' },
    { label: 'GBNF (Traditional)', value: 'gbnf' },
    { label: 'LLguidance (Advanced)', value: 'llguidance' },
]

const GrammarEngineSettings = () => {
    const { color, spacing, borderRadius } = Theme.useTheme()
    
    // Settings state using MMKV hooks
    const [engine, setEngine] = useMMKVString(GrammarSettings.Engine, 'auto') as [GrammarEngineType, (value: GrammarEngineType) => void]
    const [fallbackEngine, setFallbackEngine] = useMMKVString(GrammarSettings.FallbackEngine, 'gbnf') as [GrammarEngineType, (value: GrammarEngineType) => void]
    const [enableCaching, setEnableCaching] = useMMKVBoolean(GrammarSettings.EnableCaching, true)
    const [debugMode, setDebugMode] = useMMKVBoolean(GrammarSettings.DebugMode, false)
    const [preferredEngine, setPreferredEngine] = useMMKVString(GrammarSettings.PreferredEngine, 'gbnf') as [GrammarEngineType, (value: GrammarEngineType) => void]

    // Status state
    const [llguidanceAvailable, setLLguidanceAvailable] = useState<boolean | null>(null)
    const [performanceStats, setPerformanceStats] = useState<any>({})
    const [benchmarkRunning, setBenchmarkRunning] = useState(false)

    const grammarInference = GrammarInference.getInstance()

    useEffect(() => {
        checkLLguidanceAvailability()
        loadPerformanceStats()
    }, [])

    const checkLLguidanceAvailability = async () => {
        try {
            const available = await grammarInference.isLLguidanceAvailable()
            setLLguidanceAvailable(available)
            
            if (!available && engine === 'llguidance') {
                Logger.warn('LLguidance not available, switching to GBNF')
                handleEngineChange('gbnf')
            }
        } catch (error) {
            Logger.error(`Error checking LLguidance availability: ${error}`)
            setLLguidanceAvailable(false)
        }
    }

    const loadPerformanceStats = () => {
        try {
            const stats = grammarInference.getPerformanceStats()
            setPerformanceStats(stats)
        } catch (error) {
            Logger.debug(`Could not load performance stats: ${error}`)
        }
    }

    const handleEngineChange = (value: GrammarEngineType) => {
        setEngine(value)
        grammarInference.updateConfiguration({ engine: value })
        Logger.infoToast(`Grammar engine set to ${value}`)
    }

    const handleFallbackEngineChange = (value: GrammarEngineType) => {
        setFallbackEngine(value)
        grammarInference.updateConfiguration({ fallbackEngine: value })
    }

    const handleCachingToggle = (value: boolean) => {
        setEnableCaching(value)
        grammarInference.updateConfiguration({ enableCaching: value })
    }

    const handleDebugModeToggle = (value: boolean) => {
        setDebugMode(value)
        grammarInference.updateConfiguration({ debugMode: value })
    }

    const handlePreferredEngineChange = (value: GrammarEngineType) => {
        setPreferredEngine(value)
        grammarInference.updateConfiguration({ preferredEngine: value })
    }

    const runBenchmark = async () => {
        setBenchmarkRunning(true)
        
        try {
            // Use a simple test grammar for benchmarking
            const testGrammar = `
root ::= person
person ::= "{" ws "\\"name\\":" ws string ws "," ws "\\"age\\":" ws number ws "}"
string ::= "\\"" [^"]* "\\""
number ::= [0-9]+
ws ::= [ \\t\\n]*
            `.trim()

            const results = await grammarInference.benchmarkEngines(
                'Generate a person object:',
                testGrammar,
                'gbnf',
                3
            )

            Alert.alert({
                title: 'Grammar Engine Benchmark Results',
                description: `
GBNF Engine:
• Average Time: ${results.gbnf.averageTime.toFixed(0)}ms
• Success Rate: ${results.gbnf.successRate.toFixed(1)}%

LLguidance Engine:
• Average Time: ${results.llguidance.averageTime.toFixed(0)}ms  
• Success Rate: ${results.llguidance.successRate.toFixed(1)}%

Recommendation: ${results.recommendation.toUpperCase()}
                `.trim(),
                buttons: [
                    { label: 'Close' },
                    {
                        label: `Use ${results.recommendation.toUpperCase()}`,
                        onPress: () => handleEngineChange(results.recommendation),
                        type: 'default'
                    }
                ]
            })

            // Reload performance stats
            loadPerformanceStats()
        } catch (error) {
            Logger.errorToast(`Benchmark failed: ${error}`)
        } finally {
            setBenchmarkRunning(false)
        }
    }

    const clearCache = () => {
        Alert.alert({
            title: 'Clear Grammar Cache',
            description: 'This will clear all cached grammar compilations. They will need to be recompiled on next use.',
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Clear Cache',
                    onPress: () => {
                        grammarInference.clearCache()
                        Logger.infoToast('Grammar cache cleared')
                    },
                    type: 'warning'
                }
            ]
        })
    }

    const showEngineInfo = () => {
        Alert.alert({
            title: 'Grammar Engine Information',
            description: `
GBNF (Grammar Backus-Naur Form):
• Traditional grammar format
• Reliable and well-tested
• Good for simple to moderate complexity grammars

LLguidance:
• Advanced grammar engine
• Better performance for complex grammars
• More flexible constraint handling
${llguidanceAvailable === false ? '\n⚠️ Currently not available on this device' : ''}

Auto Select:
• Automatically chooses the best engine
• Based on grammar complexity and performance
• Falls back to GBNF if LLguidance unavailable
            `.trim(),
            buttons: [{ label: 'OK' }]
        })
    }

    const getEngineStatusColor = (engineName: string) => {
        if (engineName === 'llguidance' && !llguidanceAvailable) {
            return color.error._500
        }
        return color.primary._500
    }

    const getEngineStatusText = (engineName: string) => {
        if (engineName === 'llguidance' && llguidanceAvailable === false) {
            return 'Unavailable'
        }
        if (engineName === 'llguidance' && llguidanceAvailable === true) {
            return 'Available'
        }
        if (engineName === 'gbnf') {
            return 'Available'
        }
        return 'Unknown'
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
        statusContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing.sm,
        },
        statusText: {
            fontSize: 12,
            fontWeight: '600',
        },
        performanceContainer: {
            marginTop: spacing.sm,
            padding: spacing.sm,
            backgroundColor: color.neutral._300,
            borderRadius: borderRadius.s,
        },
        performanceText: {
            fontSize: 11,
            color: color.text._600,
        },
        buttonContainer: {
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.m,
        },
    })

    return (
        <View style={styles.container}>
            <SectionTitle>Grammar Engine</SectionTitle>
            
            <View style={styles.section}>
                <TText style={{ fontSize: 14, fontWeight: '600', marginBottom: spacing.sm }}>Primary Engine</TText>
                <DropdownSheet
                    data={engineOptions}
                    selected={engineOptions.find(opt => opt.value === engine)}
                    onChangeValue={(option) => handleEngineChange(option.value as GrammarEngineType)}
                    labelExtractor={(option) => option.label}
                    placeholder="Select Engine"
                    modalTitle="Select Primary Engine"
                />
                
                <TText style={{ marginTop: spacing.xs, fontSize: 12, color: color.text._500 }}>
                    Choose how grammar constraints are processed during text generation.
                </TText>

                <View style={styles.buttonContainer}>
                    <ThemedButton
                        label="Engine Info"
                        onPress={showEngineInfo}
                        variant="secondary"
                        buttonStyle={{ flex: 1 }}
                    />
                    <ThemedButton
                        label={benchmarkRunning ? "Running..." : "Benchmark"}
                        onPress={runBenchmark}
                        variant="primary"
                        disabled={benchmarkRunning}
                        buttonStyle={{ flex: 1 }}
                    />
                </View>
            </View>

            <View style={styles.section}>
                <TText style={{ fontSize: 14, fontWeight: '600', marginBottom: spacing.sm }}>
                    Engine Status
                </TText>
                
                <View style={styles.statusContainer}>
                    <TText>GBNF Engine</TText>
                    <TText style={[styles.statusText, { color: getEngineStatusColor('gbnf') }]}>
                        {getEngineStatusText('gbnf')}
                    </TText>
                </View>
                
                <View style={styles.statusContainer}>
                    <TText>LLguidance Engine</TText>
                    <TText style={[styles.statusText, { color: getEngineStatusColor('llguidance') }]}>
                        {getEngineStatusText('llguidance')}
                    </TText>
                </View>

                {Object.keys(performanceStats).length > 0 && (
                    <View style={styles.performanceContainer}>
                        <TText style={{ fontSize: 12, fontWeight: '600', marginBottom: spacing.xs }}>
                            Performance Stats
                        </TText>
                        {Object.entries(performanceStats).map(([engine, stats]: [string, any]) => (
                            <TText key={engine} style={styles.performanceText}>
                                {engine.toUpperCase()}: {stats.totalRequests} requests, {stats.successRate.toFixed(1)}% success, {stats.averageTime.toFixed(0)}ms avg
                            </TText>
                        ))}
                    </View>
                )}
            </View>

            <View style={styles.section}>
                <TText style={{ fontSize: 14, fontWeight: '600', marginBottom: spacing.sm }}>Fallback Engine</TText>
                <DropdownSheet
                    data={engineOptions.filter(opt => opt.value !== 'auto')}
                    selected={engineOptions.find(opt => opt.value === fallbackEngine)}
                    onChangeValue={(option) => handleFallbackEngineChange(option.value as GrammarEngineType)}
                    labelExtractor={(option) => option.label}
                    placeholder="Select Fallback Engine"
                    modalTitle="Select Fallback Engine"
                />
                
                <TText style={{ marginTop: spacing.xs, fontSize: 12, color: color.text._500 }}>
                    Engine to use if the primary engine fails.
                </TText>
            </View>

            {engine === 'auto' && (
                <View style={styles.section}>
                    <TText style={{ fontSize: 14, fontWeight: '600', marginBottom: spacing.sm }}>Preferred Engine (Auto Mode)</TText>
                    <DropdownSheet
                        data={engineOptions.filter(opt => opt.value !== 'auto')}
                        selected={engineOptions.find(opt => opt.value === preferredEngine)}
                        onChangeValue={(option) => handlePreferredEngineChange(option.value as GrammarEngineType)}
                        labelExtractor={(option) => option.label}
                        placeholder="Select Preferred Engine"
                        modalTitle="Select Preferred Engine"
                    />
                    
                    <TText style={{ marginTop: spacing.xs, fontSize: 12, color: color.text._500 }}>
                        Preferred engine when auto-selection criteria are equal.
                    </TText>
                </View>
            )}

            <View style={styles.section}>
                <ThemedSwitch
                    label="Enable Grammar Caching"
                    value={enableCaching}
                    onChangeValue={handleCachingToggle}
                    description="Cache compiled grammars for faster subsequent use"
                />

                <ThemedSwitch
                    label="Debug Mode"
                    value={debugMode}
                    onChangeValue={handleDebugModeToggle}
                    description="Enable detailed logging for grammar processing"
                />

                <ThemedButton
                    label="Clear Grammar Cache"
                    onPress={clearCache}
                    variant="secondary"
                    buttonStyle={{ marginTop: spacing.m }}
                />
            </View>
        </View>
    )
}

export default GrammarEngineSettings