# Grammar File Upload Guide

ChatterUI now supports uploading grammar constraint files to guide AI text generation. This ensures the AI follows specific formats, structures, or patterns.

## 📁 Supported File Types

### 🔤 GBNF Files (.gbnf, .txt)
**GBNF (Grammar Backus-Naur Form)** files define grammar rules directly.

### 📋 JSON Schema Files (.json)
**JSON Schema** files are automatically converted to GBNF grammar rules.

## 🚀 How to Upload Grammar Files

1. **Open Settings** → **Sampler** menu
2. **Find the "Grammar" text field**
3. **Click "Upload GBNF"** or **"Upload JSON"** buttons below the grammar field
4. **Select your file** from device storage
5. **Grammar loads automatically** into the text field

## 📝 Example Files

### GBNF Example (save as `example.gbnf`):
```
root ::= object
object ::= "{" ws member (ws "," ws member)* ws "}"
member ::= string ws ":" ws value
string ::= "\"" [^"]* "\""
value ::= string | number | object | array | "true" | "false" | "null"
number ::= [0-9]+
array ::= "[" ws value (ws "," ws value)* ws "]"
ws ::= [ \t\n]*
```

### JSON Schema Example (save as `example.json`):
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "age": {
      "type": "integer",
      "minimum": 0
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "preferences": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": ["name", "age"]
}
```

### Simple JSON Schema Examples:
**For plain text response:**
```json
{
  "type": "string"
}
```

**For yes/no response:**
```json
{
  "type": "boolean"
}
```

**For numbered response:**
```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 10
}
```

## 🎯 Using Grammar Constraints

1. **Upload your grammar file** using the buttons in Sampler settings
2. **Enable the Grammar toggle** in the chat interface (next to input field)  
3. **Long press the Grammar button** to see current rules and status
4. **Generate text** - the AI will follow your grammar constraints

### 🔄 Dual Generation Mode
When grammar is enabled, ChatterUI uses **dual generation**:
- **Phase 1**: Generates naturally (saved to conversation)
- **Phase 2**: Generates with grammar constraints (for guidance)

This ensures natural conversation flow while respecting your grammar rules.

## 💡 Use Cases

- **JSON/XML output** - Force structured data format
- **Code generation** - Enforce syntax rules  
- **Form filling** - Ensure specific field formats
- **Poetry/lyrics** - Define rhyme schemes and meter
- **Technical documentation** - Maintain consistent structure

## 🛠️ Tips

- **Test small examples first** before complex grammars
- **Check grammar syntax** if conversion fails
- **Use descriptive file names** to track different grammar sets
- **Combine with character cards** for specialized AI assistants

## 🐛 Troubleshooting

### JSON Upload Fails: "Cannot read property 'type' of undefined"
- **Cause**: JSON schema missing required `"type"` property
- **Fix**: Add `"type": "object"` (or "string", "array", etc.) to your JSON
- **Example**: `{ "type": "object", "properties": {...} }`

### GBNF Upload Fails: "Invalid content type at row X, column Y"
- **Cause**: Syntax error in GBNF grammar rules
- **Fix**: Check line X, column Y for typos or missing `::=`
- **Example**: Rules must be `rule_name ::= definition`

### Grammar Disappears After Chat
- **Cause**: Fixed in latest version
- **Fix**: Check if grammar toggle is still enabled in chat interface
- **Note**: Grammar persists through dual-generation mode

### Upload File Button Not Working
- **Cause**: File permissions or format issues
- **Fix**: Ensure file is `.gbnf`, `.txt`, or `.json` format
- **Note**: Files are copied to app cache for security 