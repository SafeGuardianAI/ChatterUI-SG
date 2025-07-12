# Rescue API Integration

This feature enables ChatterUI to collect and report structured victim information during emergency situations. The AI can generate JSON-formatted victim data that is automatically sent to a rescue coordination endpoint.

## Features

- **Dual Backend Support**: Choose between Firebase and MongoDB backends
- **Automatic victim data extraction**: Parses AI-generated JSON responses
- **Smart ID tracking**: Updates existing victims or creates new ones
- **Grammar-based generation**: Ensures consistent data structure
- **Real-time reporting**: Sends data immediately when valid information is detected
- **Connection testing**: Verify API endpoint before use
- **Custom grammar support**: Load your own GBNF grammar files

## Backend Differences

### MongoDB Backend
- **Structure**: Nested JSON with `victim_data` root object (from `victim_json_template_flat.json`)
- **ID Format**: 24-character hexadecimal ObjectId (e.g., `507f1f77bcf86cd799439011`)
- **Collection**: `disaster_rescue.rescue_team_dataset`
- **Connection**: MongoDB Atlas with connection string

### Firebase Backend
- **Structure**: Nested JSON with `victim_info` root object
- **ID Format**: 20-character alphanumeric with `-` prefix (e.g., `-NkQ9XPZ1234567890AB`)
- **Collection**: `victims`
- **Connection**: Firebase Realtime Database

## Backend Implementation Notes

### ID Generation Issue

If you're seeing Firebase-style IDs (like `-OV-X1ZVXLE8cIGcFjEx`) when using MongoDB backend, the Python backend needs to be updated:

**Current Issue**: Backend returns Firebase IDs regardless of database type
**Expected**: MongoDB should return 24-character hex ObjectIds

**Python Backend Fix**:

**For MongoDB**:
```python
from bson import ObjectId
from pymongo import MongoClient

class RescueAPIMongo:
    def __init__(self):
        self.client = MongoClient('mongodb+srv://...')
        self.db = self.client.disaster_rescue
        self.collection = self.db.rescue_team_dataset
        
    def post_victim(self, victim_data):
        # Generate proper MongoDB ObjectId
        victim_id = ObjectId()
        
        # Add ID to document
        victim_data['_id'] = victim_id
        
        # Insert to MongoDB
        result = self.collection.insert_one(victim_data)
        
        # Return ObjectId as string (24 hex chars)
        return str(victim_id)  # e.g., "67352e8b445df272b0fc1347"
```

**For Firebase**:
```python
import firebase_admin
from firebase_admin import credentials, db

class RescueAPIFirebase:
    def __init__(self):
        # Initialize Firebase
        cred = credentials.Certificate('path/to/serviceAccountKey.json')
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://your-project.firebaseio.com'
        })
        
    def post_victim(self, victim_data):
        # Generate Firebase push ID
        ref = db.reference('victims')
        new_victim_ref = ref.push()
        victim_id = new_victim_ref.key  # e.g., "-OV-X1ZVXLE8cIGcFjEx"
        
        # Add ID to data and save
        victim_data['id'] = victim_id
        new_victim_ref.set(victim_data)
        
        return victim_id
```

**Unified Backend with Database Detection**:
```python
class RescueAPI:
    def __init__(self, db_type='mongodb'):
        self.db_type = db_type
        if db_type == 'mongodb':
            self.setup_mongodb()
        else:
            self.setup_firebase()
    
    def post_victim(self, victim_data):
        if self.db_type == 'mongodb':
            return self.post_victim_mongodb(victim_data)
        else:
            return self.post_victim_firebase(victim_data)
```

The frontend will accept both ID formats but will log warnings when there's a mismatch between the selected backend and the ID format received.

## Setup

1. **Enable Rescue API**
   - Go to Settings → App Settings → Rescue API Integration
   - Toggle "Enable Rescue API" ON

2. **Select Backend**
   - Choose between MongoDB Backend and Firebase Backend
   - Only one backend can be active at a time

3. **Configure Endpoint**
   - Default: `https://safeguardian-33b94228882a.herokuapp.com/`
   - Update if using a different server

4. **Load Grammar**
   - The victim schema grammar loads automatically on first enable
   - Or manually load: Grammar Management → Load Default Grammar
   - Custom grammars can be loaded from files

5. **Test Connection**
   - Click "Test Connection" to verify backend access
   - Shows victim count if successful

## Usage

1. **Enable Grammar in Chat**
   - Go to chat settings (gear icon)
   - Toggle "Grammar" ON
   - Ensure victim grammar is loaded

2. **Generate Victim Data**
   - Chat normally about victim information
   - AI will generate structured JSON responses
   - Valid data is automatically sent to the API

3. **Track Victims**
   - First report creates a new victim with unique ID
   - Subsequent reports update the same victim
   - Click "Create New Victim" to start tracking a new person

## Data Structure Examples

### MongoDB (victim_data root)
```json
{
  "victim_data": {
    "id": "",
    "emergency_status": "critical",
    "location": {
      "lat": 40.7128,
      "lon": -74.0060,
      "details": "Times Square, New York",
      "nearest_landmark": "Times Square"
    },
    "personal_info": {
      "name": "John Doe",
      "age": 45,
      "gender": "male",
      "language": "English",
      "physical_description": "Brown hair, blue shirt"
    },
    "medical_info": {
      "injuries": ["broken leg", "cuts on arms"],
      "pain_level": 8,
      "medical_conditions": [],
      "medications": [],
      "allergies": [],
      "blood_type": "O+"
    },
    "situation": {
      "disaster_type": "building collapse",
      "immediate_needs": ["medical attention", "water"],
      "trapped": false,
      "mobility": "immobile",
      "nearby_hazards": ["unstable debris"]
    }
  }
}
```

### Firebase (victim_info root)
```json
{
  "victim_info": {
    "personal_info": {
      "name": "John Doe",
      "age": 45,
      "gender": "male"
    },
    "location": {
      "lat": 40.7128,
      "lon": -74.0060,
      "details": "Times Square, New York"
    },
    "medical_info": {
      "injuries": ["broken leg", "cuts on arms"]
    },
    "emergency_status": "critical",
    "situation": {
      "immediate_needs": ["medical attention", "water"]
    }
  }
}
```

## API Endpoints

The system uses different endpoints based on the selected backend:

### MongoDB Endpoints
- **Create**: `POST /victim/report`
- **Update**: `POST /victim/update/{objectId}`
- **Get One**: `GET /victim/{objectId}`
- **Get All**: `GET /victims/all`

### Firebase Endpoints
- **Create**: `POST /victim/create`
- **Update**: `POST /victim/{victimId}/update`
- **Get One**: `GET /victim/{victimId}`
- **Get All**: `GET /victims`

## Grammar System

### Default Grammar
The app includes `victim_schema.gbnf` which enforces the complete victim data structure. It automatically loads when:
- First enabling Rescue API with no existing grammar
- Manually selecting "Load Default Grammar"

### Grammar Features
- **Auto-caching**: Grammar is cached when toggling on/off
- **Custom files**: Load your own GBNF grammar files
- **Simple test**: Use simplified grammar for testing
- **Presets**: Create sampler presets with pre-loaded grammar

### Grammar Toggle
In the chat interface:
1. Click Grammar button to enable/disable
2. Long-press to view current grammar and options
3. Grammar remains cached when toggling off

## Troubleshooting

### Connection Issues
- Verify API endpoint is correct
- Check internet connection
- Ensure backend server is running
- Test with "Test Connection" button

### Grammar Errors
If you see "Failed to initialize sampling":
1. Try the simple test grammar first
2. Verify GBNF syntax is valid
3. Clear custom grammar and use default
4. Create new sampler preset

### Backend-Specific Issues

**MongoDB:**
- Ensure ObjectId is 24 hex characters
- Check MongoDB connection string is valid
- Verify data uses `victim_data` root (not `victim_info`)
- Template: `victim_json_template_flat.json` (nested structure despite the name)
- Backend bug: Ensure `post_victim` uses actual data, not template

**Firebase:**
- Ensure Firebase project is configured
- Check authentication settings
- Verify nested JSON structure
- ID should start with `-` and be ~20 characters

### Data Not Sending
1. Verify Rescue API is enabled
2. Check Auto Report is ON
3. Ensure grammar is enabled in chat
4. Verify AI response contains valid JSON
5. Check logs for parsing errors

## Best Practices

1. **Test First**: Always test connection before live use
2. **Grammar Selection**: Use appropriate grammar for your backend
3. **ID Management**: Let system handle victim IDs automatically
4. **Error Monitoring**: Check logs for detailed error messages
5. **Backup Data**: Keep local copies of critical victim information

## Example Chat Session

```
User: I found an injured person at Times Square. Male, about 45 years old, 
broken leg and cuts on his arms. Needs immediate medical attention.

AI: {
  "victim_info": {
    "personal_info": {
      "name": "Unknown",
      "age": 45,
      "gender": "male"
    },
    "location": {
      "lat": 40.7580,
      "lon": -73.9855,
      "details": "Times Square, New York",
      "nearest_landmark": "Times Square"
    },
    "medical_info": {
      "injuries": ["broken leg", "cuts on arms"],
      "pain_level": 8
    },
    "emergency_status": "critical",
    "situation": {
      "immediate_needs": ["medical attention", "pain relief", "immobilization"],
      "mobility": "immobile"
    }
  }
}

[System: New victim reported with ID: -NkQ9XPZ1234567890AB]
```

## Security Considerations

- API endpoints should use HTTPS
- Implement authentication on backend
- Sanitize all input data
- Follow privacy regulations for victim data
- Regular security audits recommended 