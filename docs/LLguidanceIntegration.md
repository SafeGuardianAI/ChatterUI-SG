# LLguidance Integration Guide

## Overview

This guide explains how LLguidance is integrated into ChatterUI as an alternative grammar decoding engine alongside the existing GBNF system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                    │
├─────────────────────────────────────────────────────────────┤
│  GrammarToggle  │  SamplerMenu  │  RescueAPISettings  │  Settings │
├─────────────────────────────────────────────────────────────┤
│                  Grammar Helper & Hooks                     │
├─────────────────────────────────────────────────────────────┤
│                   Grammar Inference                         │
├─────────────────────────────────────────────────────────────┤
│                   Grammar Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│   GBNF Engine   │        LLguidance Engine                   │
├─────────────────────────────────────────────────────────────┤
│  Existing Llama │        LLguidance Native                   │
│   Pipeline      │           Module                           │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points

### 1. **Drop-in Replacement**
```typescript
// Before: Direct GBNF usage
updateCurrentConfig({
    data: { ...data, grammar_string: grammarContent }
})

// After: Smart engine selection
import { GrammarHelper } from '@lib/engine/Grammar'

const result = await GrammarHelper.generateWithGrammar(
    prompt, 
    grammarContent,
    { temperature: 0.7, maxTokens: 150 }
)
```

### 2. **React Hook Integration**
```typescript
import { useGrammarEngine } from '@lib/engine/Grammar'

const MyComponent = () => {
    const {
        isInitialized,
        currentEngine,
        llguidanceAvailable,
        generateWithGrammar,
        validateGrammar,
        updateEngine
    } = useGrammarEngine()

    // Your component logic here
}
```

### 3. **Settings Integration**
```typescript
// Add to your settings menu
import GrammarEngineSettings from '@/screens/AppSettingsMenu/GrammarEngineSettings'

// Users can configure:
// - Primary engine (GBNF/LLguidance/Auto)
// - Fallback engine
// - Caching settings
// - Debug mode
// - Performance benchmarking
```

## Engine Selection Logic

### **Auto Mode** (Default)
- **Simple grammars** → GBNF (faster startup)
- **Complex grammars** → LLguidance (better performance)
- **Performance-based** → Uses historical performance data
- **Availability-based** → Falls back if LLguidance unavailable

### **Manual Mode**
- **GBNF**: Traditional, reliable, works everywhere
- **LLguidance**: Advanced, faster for complex grammars, platform-dependent

## Performance Characteristics

| Grammar Type | GBNF | LLguidance | Recommendation |
|--------------|------|------------|----------------|
| Simple JSON | ✅ Fast | ⚡ Very Fast | Auto |
| Complex Schema | 🐌 Slow | ⚡ Fast | LLguidance |
| GBNF Rules | ✅ Native | 🔄 Converted | GBNF |
| Regex Patterns | 🔄 Limited | ✅ Native | LLguidance |

## Setup Instructions

### 1. **Basic Integration**
```typescript
// In your main app initialization
import { GrammarInference } from '@lib/engine/Grammar'

const initializeApp = async () => {
    const grammarInference = GrammarInference.getInstance()
    await grammarInference.initialize()
    
    // App is ready with grammar engine support
}
```

### 2. **Component Migration**
```typescript
// Replace existing grammar components
import GrammarToggleEnhanced from '@/screens/ChatMenu/GrammarToggleEnhanced'

// Enhanced features:
// - Engine status indicator
// - Grammar validation
// - Test generation
// - Performance feedback
```

### 3. **Settings Integration**
```typescript
// Add to your settings navigation
import GrammarEngineSettings from '@/screens/AppSettingsMenu/GrammarEngineSettings'

// Features:
// - Engine selection
// - Performance benchmarking
// - Cache management
// - Debug controls
```

## Native Module Setup

### **Required Dependencies**
```json
{
  "dependencies": {
    "llguidance": "^0.1.0"
  }
}
```

### **iOS Setup** (ios/Podfile)
```ruby
pod 'LLguidance', '~> 0.1.0'
```

### **Android Setup** (android/app/build.gradle)
```gradle
dependencies {
    implementation 'com.llguidance:llguidance-android:0.1.0'
}
```

### **Native Module Implementation**
- Implement `LLguidanceModule` for each platform
- Link against LLguidance C++ library
- Handle async operations and JSON serialization
- See `lib/engine/Grammar/LLguidanceNative.ts` for interface specification

## Configuration Options

### **Engine Settings**
```typescript
const config = {
    engine: 'auto',              // 'gbnf' | 'llguidance' | 'auto'
    fallbackEngine: 'gbnf',      // Fallback if primary fails
    enableCaching: true,         // Cache compiled grammars
    debugMode: false,            // Enable debug logging
    preferredEngine: 'gbnf'      // Preference for auto mode
}
```

### **Performance Tuning**
```typescript
// Automatic benchmarking
const benchmark = await grammarInference.benchmarkEngines(
    prompt, 
    grammar, 
    'gbnf',
    iterations: 5
)

// Apply recommendation
grammarInference.updateConfiguration({ 
    engine: benchmark.recommendation 
})
```

## Migration Path

### **Phase 1: Drop-in Integration**
1. Install LLguidance dependencies
2. Add grammar engine files to project
3. Initialize grammar inference in app startup
4. Existing grammar functionality continues working

### **Phase 2: Enhanced Components**
1. Replace grammar components with enhanced versions
2. Add grammar engine settings to configuration menu
3. Users can choose engines and see performance benefits

### **Phase 3: Optimization**
1. Run benchmarks on user devices
2. Optimize engine selection based on real performance
3. Fine-tune caching and validation

## Backward Compatibility

✅ **Existing GBNF code continues working**
✅ **No breaking changes to grammar APIs**
✅ **Graceful fallback if LLguidance unavailable**
✅ **Same grammar file formats supported**

## Error Handling

```typescript
try {
    const result = await generateWithGrammar(prompt, grammar)
    // Use result.text
} catch (error) {
    // Automatic fallback attempted
    // User notified of any issues
    // Graceful degradation to GBNF
}
```

## Performance Monitoring

```typescript
// Built-in performance tracking
const stats = grammarInference.getPerformanceStats()

// Example output:
{
    gbnf: {
        totalRequests: 100,
        successRate: 98.5,
        averageTime: 150
    },
    llguidance: {
        totalRequests: 75,
        successRate: 99.2,
        averageTime: 95
    }
}
```

## Troubleshooting

### **LLguidance Not Available**
- Check native module installation
- Verify platform compatibility
- Falls back to GBNF automatically

### **Performance Issues**
- Run benchmark to compare engines
- Check caching configuration
- Monitor memory usage in debug mode

### **Grammar Validation Errors**
- Use enhanced validation features
- Check grammar syntax with both engines
- Review validation warnings and suggestions

## Example Usage

### **Simple Grammar Generation**
```typescript
import { GrammarHelper } from '@lib/engine/Grammar'

const result = await GrammarHelper.generateWithGrammar(
    'Generate a person object:',
    `root ::= person
     person ::= "{" ws "\"name\":" ws string ws "," ws "\"age\":" ws number ws "}"
     string ::= "\"" [^"]* "\""
     number ::= [0-9]+
     ws ::= [ \\t\\n]*`,
    { temperature: 0.7, maxTokens: 100 }
)

console.log(result) // Generated JSON following the grammar
```

### **React Component Integration**
```typescript
import { useGrammarEngine } from '@lib/engine/Grammar'

const GrammarComponent = () => {
    const { generateWithGrammar, currentEngine } = useGrammarEngine()
    
    const handleGenerate = async () => {
        const result = await generateWithGrammar(prompt, grammar)
        setOutput(result)
    }
    
    return (
        <View>
            <Text>Engine: {currentEngine}</Text>
            <Button onPress={handleGenerate} title="Generate" />
        </View>
    )
}
```

This integration provides a powerful, flexible grammar system that enhances the existing pipeline while maintaining full backward compatibility.