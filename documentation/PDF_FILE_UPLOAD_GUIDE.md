# PDF File Upload Guide

## Overview

The WhatsApp service now supports sending **actual PDF files** instead of just URLs. This means you can upload PDF files directly from your server's file system.

## What Changed

### Before
- Only URLs to PDFs could be sent
- PDFs had to be hosted online somewhere
- Limited to publicly accessible URLs

### After
- Can send PDF files directly from your server
- No need to host files online
- More secure and private
- Faster uploads (no external URL fetching)

## How It Works

The system now automatically detects whether you're providing:
1. **A URL** (starts with `http://` or `https://`)
2. **A file path** (local file on your server)
3. **Buffer data** (file content in memory)

## Usage Examples

### Method 1: File Path (Recommended)

Send a PDF file from your server's file system:

```json
{
  "instanceId": "your-instance-id",
  "response_msg": "/path/to/your/document.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "my-document.pdf"
  }
}
```

### Method 2: Object with File Path

```json
{
  "instanceId": "your-instance-id",
  "response_msg": {
    "url": "/path/to/your/document.pdf",
    "fileName": "my-document.pdf",
    "mimetype": "application/pdf"
  },
  "options": {
    "messageType": "pdf"
  }
}
```

### Method 3: Buffer Data (Advanced)

If you have the PDF content in memory:

```json
{
  "instanceId": "your-instance-id",
  "response_msg": {
    "buffer": "base64-encoded-pdf-content",
    "fileName": "my-document.pdf",
    "mimetype": "application/pdf"
  },
  "options": {
    "messageType": "pdf"
  }
}
```

## File Path Examples

### Absolute Paths
```json
{
  "response_msg": "/home/user/documents/report.pdf"
}
```

### Relative Paths
```json
{
  "response_msg": "./uploads/report.pdf"
}
```

### Windows Paths
```json
{
  "response_msg": "C:\\Users\\username\\Documents\\report.pdf"
}
```

## Security Considerations

### File Access
- The WhatsApp service needs **read permission** for the PDF files
- Files should be in a secure directory
- Consider using a dedicated uploads folder

### File Size Limits
- WhatsApp has file size limits (typically 16MB for documents)
- Large files may fail to upload
- Consider compressing PDFs if they're too large

### Path Validation
- The system validates that files exist before attempting to send
- Invalid paths will return clear error messages

## Error Handling

### Common Errors

1. **File Not Found**
   ```
   "Document file not found at path: /path/to/file.pdf"
   ```
   **Solution:** Check the file path and ensure the file exists

2. **Permission Denied**
   ```
   "Failed to read file at path: /path/to/file.pdf. Error: EACCES: permission denied"
   ```
   **Solution:** Check file permissions and ensure the service can read the file

3. **File Too Large**
   ```
   "File size exceeds WhatsApp limits"
   ```
   **Solution:** Compress the PDF or split it into smaller files

## Best Practices

### 1. Use Absolute Paths
```json
{
  "response_msg": "/var/www/uploads/documents/report.pdf"
}
```

### 2. Create a Dedicated Uploads Directory
```bash
mkdir -p /var/www/uploads/documents
chmod 755 /var/www/uploads/documents
```

### 3. Validate Files Before Sending
```javascript
const fs = require('fs');
const path = require('path');

function validatePDFFile(filePath) {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  
  // Check file size (16MB limit)
  const stats = fs.statSync(filePath);
  if (stats.size > 16 * 1024 * 1024) {
    throw new Error('File too large');
  }
  
  // Check file extension
  if (path.extname(filePath).toLowerCase() !== '.pdf') {
    throw new Error('File must be a PDF');
  }
}
```

### 4. Use Descriptive Filenames
```json
{
  "options": {
    "fileName": "Monthly_Report_January_2024.pdf"
  }
}
```

## Testing

### Test with a Sample PDF

1. Create a test PDF file:
```bash
echo "This is a test PDF" > test.pdf
```

2. Send it via the API:
```bash
curl -X POST http://localhost:8080/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "instanceId": "your-instance-id",
    "response_msg": "./test.pdf",
    "options": {
      "messageType": "pdf",
      "fileName": "test-document.pdf"
    }
  }'
```

## Migration from URLs

### Before (URL-based)
```json
{
  "response_msg": "https://example.com/document.pdf",
  "options": {
    "messageType": "pdf"
  }
}
```

### After (File-based)
```json
{
  "response_msg": "/var/www/uploads/document.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "document.pdf"
  }
}
```

## Performance Benefits

1. **Faster Uploads**: No need to download from external URLs
2. **More Reliable**: No dependency on external services
3. **Better Security**: Files stay on your server
4. **Cost Effective**: No bandwidth costs for external downloads

## Troubleshooting

### File Path Issues
- Use absolute paths when possible
- Check file permissions
- Ensure the WhatsApp service has access to the directory

### File Size Issues
- Compress PDFs using tools like `ghostscript`
- Split large documents into smaller parts
- Use online PDF compression services

### Permission Issues
```bash
# Give read permission to the uploads directory
chmod 755 /var/www/uploads
chmod 644 /var/www/uploads/*.pdf
```

## Examples in Different Languages

### Python
```python
import requests

# Send a PDF file
response = requests.post('http://localhost:8080/api/send', json={
    'instanceId': 'your-instance-id',
    'response_msg': '/path/to/document.pdf',
    'options': {
        'messageType': 'pdf',
        'fileName': 'document.pdf'
    }
})
```

### Node.js
```javascript
const axios = require('axios');

const response = await axios.post('http://localhost:8080/api/send', {
    instanceId: 'your-instance-id',
    response_msg: '/path/to/document.pdf',
    options: {
        messageType: 'pdf',
        fileName: 'document.pdf'
    }
});
```

### PHP
```php
$data = [
    'instanceId' => 'your-instance-id',
    'response_msg' => '/path/to/document.pdf',
    'options' => [
        'messageType' => 'pdf',
        'fileName' => 'document.pdf'
    ]
];

$response = file_get_contents('http://localhost:8080/api/send', false, stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($data)
    ]
]));
```

This enhancement makes your WhatsApp service much more flexible and secure for handling PDF documents! 