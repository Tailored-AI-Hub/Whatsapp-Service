# WhatsApp Media Messages Guide

## Overview

The WhatsApp service has been enhanced to support sending images and PDF documents in addition to text messages. This guide explains how to use these new features.

## What Changed

### 1. New Message Types Added

The system now supports three additional message types:
- `image` - for sending images
- `document` - for sending documents (including PDFs)
- `pdf` - alias for document type (same functionality)

### 2. Enhanced Validation

The API now validates:
- URL format for media files
- Required fields for each message type
- Proper data structure for media objects

## How to Use

### Sending Images

#### Method 1: Simple URL (String)
```json
{
  "instanceId": "your-instance-id",
  "response_msg": "https://example.com/image.jpg",
  "options": {
    "messageType": "image",
    "caption": "Optional image caption"
  }
}
```

#### Method 2: Object with URL
```json
{
  "instanceId": "your-instance-id",
  "response_msg": {
    "url": "https://example.com/image.jpg",
    "caption": "Optional image caption"
  },
  "options": {
    "messageType": "image"
  }
}
```

### Sending PDFs/Documents

#### Method 1: Simple URL (String)
```json
{
  "instanceId": "your-instance-id",
  "response_msg": "https://example.com/document.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "my-document.pdf",
    "mimetype": "application/pdf"
  }
}
```

#### Method 2: Object with URL
```json
{
  "instanceId": "your-instance-id",
  "response_msg": {
    "url": "https://example.com/document.pdf",
    "fileName": "my-document.pdf",
    "mimetype": "application/pdf"
  },
  "options": {
    "messageType": "pdf"
  }
}
```

## Technical Details for Non-JavaScript Developers

### What is a "Switch Statement"?

Think of a switch statement like a traffic light system:
- When you approach an intersection, the light tells you what to do
- Green = go, Red = stop, Yellow = slow down
- Similarly, the code checks the message type and executes different code for each type

```javascript
switch (messageType) {
  case 'image':     // If messageType is 'image'
    // Handle image logic
    break;
  case 'pdf':       // If messageType is 'pdf'
    // Handle PDF logic
    break;
  default:          // If none of the above match
    // Handle text message (default)
    break;
}
```

### What is "Type Checking"?

Type checking is like verifying what kind of data you're working with:
- A string is text enclosed in quotes: `"hello"`
- An object is data enclosed in curly braces: `{"name": "value"}`
- The code checks which type you provided and handles it accordingly

### URL Validation

The system validates URLs to ensure they're properly formatted:
- Valid: `https://example.com/image.jpg`
- Invalid: `not-a-url`

This prevents errors when trying to send media files.

## Error Handling

### Common Errors and Solutions

1. **"Invalid image URL format"**
   - Solution: Ensure the URL starts with `http://` or `https://`

2. **"Image requires a valid URL"**
   - Solution: Provide either a string URL or an object with a `url` property

3. **"Invalid document format"**
   - Solution: Same as above, but for documents

## API Endpoint

The endpoint remains the same: `POST /api/send`

### Request Structure
```json
{
  "instanceId": "string (required)",
  "response_msg": "string or object (required)",
  "message_object": "object (optional)",
  "to": "string (optional)",
  "options": {
    "messageType": "text|poll|image|document|pdf",
    "caption": "string (for images)",
    "fileName": "string (for documents)",
    "mimetype": "string (for documents)"
  }
}
```

### Response Structure
```json
{
  "success": true,
  "message": "Message sent successfully",
  "result": {
    // WhatsApp message details
  }
}
```

## Examples in Different Programming Languages

### Python
```python
import requests

# Send an image
response = requests.post('http://localhost:8080/api/send', json={
    'instanceId': 'your-instance-id',
    'response_msg': 'https://example.com/image.jpg',
    'options': {
        'messageType': 'image',
        'caption': 'Check out this image!'
    }
})
```

### Java
```java
// Using OkHttp
String jsonBody = "{\"instanceId\":\"your-instance-id\",\"response_msg\":\"https://example.com/image.jpg\",\"options\":{\"messageType\":\"image\",\"caption\":\"Check out this image!\"}}";

RequestBody body = RequestBody.create(jsonBody, MediaType.parse("application/json"));
Request request = new Request.Builder()
    .url("http://localhost:8080/api/send")
    .post(body)
    .build();
```

### C#
```csharp
// Using HttpClient
var data = new
{
    instanceId = "your-instance-id",
    response_msg = "https://example.com/image.jpg",
    options = new
    {
        messageType = "image",
        caption = "Check out this image!"
    }
};

var json = JsonConvert.SerializeObject(data);
var content = new StringContent(json, Encoding.UTF8, "application/json");
var response = await httpClient.PostAsync("http://localhost:8080/api/send", content);
```

## Backward Compatibility

The changes are fully backward compatible:
- Existing text messages continue to work without modification
- Poll messages continue to work without modification
- Only new message types require the `messageType` option

## Testing

You can test the new functionality using curl:

```bash
# Send an image
curl -X POST http://localhost:8080/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "instanceId": "your-instance-id",
    "response_msg": "https://example.com/image.jpg",
    "options": {
      "messageType": "image",
      "caption": "Test image"
    }
  }'

# Send a PDF
curl -X POST http://localhost:8080/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "instanceId": "your-instance-id",
    "response_msg": "https://example.com/document.pdf",
    "options": {
      "messageType": "pdf",
      "fileName": "test-document.pdf"
    }
  }'
``` 