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

## Backward Compatibility

The changes are fully backward compatible:
- Existing text messages continue to work without modification
- Poll messages continue to work without modification
- Only new message types require the `messageType` option

