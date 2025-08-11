# S3 URL Download Guide

## Overview

The WhatsApp service now supports downloading PDF files from S3 public URLs and sending the actual file content to WhatsApp, rather than just sending the URL. This is perfect for S3-hosted documents.

## What Changed

### Before
- Only sent URLs to WhatsApp
- WhatsApp would download the file itself
- Limited control over the process

### After
- Downloads the file from S3 URL to your server
- Sends the actual file content to WhatsApp
- Better control and reliability
- Works with any public URL (S3, CloudFront, etc.)

## How It Works

### The Process
1. **Receive Request** → API gets a PDF URL
2. **Download File** → System downloads the PDF from S3
3. **Validate Content** → Checks the downloaded file
4. **Send to WhatsApp** → Uploads the actual file content
5. **Clean Up** → Removes temporary data

### Technical Details
```javascript
// The system now does this automatically:
const fileBuffer = await downloadFromURL(s3Url);
messageContent = {
  document: fileBuffer,  // Actual file content, not URL
  mimetype: 'application/pdf',
  fileName: 'document.pdf'
};
```

## Usage Examples

### Method 1: Simple S3 URL
```json
{
  "instanceId": "your-instance-id",
  "response_msg": "https://your-bucket.s3.amazonaws.com/document.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "my-document.pdf"
  }
}
```

### Method 2: Object with S3 URL
```json
{
  "instanceId": "your-instance-id",
  "response_msg": {
    "url": "https://your-bucket.s3.amazonaws.com/document.pdf",
    "fileName": "my-document.pdf",
    "mimetype": "application/pdf"
  },
  "options": {
    "messageType": "pdf"
  }
}
```

### Method 3: CloudFront URL
```json
{
  "instanceId": "your-instance-id",
  "response_msg": "https://d1234.cloudfront.net/documents/report.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "monthly-report.pdf"
  }
}
```

## S3 URL Examples

### Standard S3 URLs
```json
{
  "response_msg": "https://my-bucket.s3.amazonaws.com/folder/document.pdf"
}
```

### S3 URLs with Custom Domain
```json
{
  "response_msg": "https://documents.mycompany.com/report.pdf"
}
```

### CloudFront URLs
```json
{
  "response_msg": "https://d1234.cloudfront.net/documents/report.pdf"
}
```

### Presigned URLs
```json
{
  "response_msg": "https://my-bucket.s3.amazonaws.com/document.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
}
```

## Benefits

### 1. **Better Control**
- You control the download process
- Can validate files before sending
- Can handle errors gracefully

### 2. **Improved Reliability**
- No dependency on WhatsApp's download capabilities
- Can retry failed downloads
- Better error handling

### 3. **Security**
- Can validate file types and sizes
- Can check file integrity
- More secure than sending URLs

### 4. **Performance**
- Faster uploads to WhatsApp
- No double-downloading (WhatsApp doesn't need to download again)
- Better user experience

## Error Handling

### Common S3 Download Errors

1. **File Not Found (404)**
   ```
   "Failed to download file from URL: https://bucket.s3.amazonaws.com/file.pdf. Error: Failed to download file: HTTP 404"
   ```
   **Solution:** Check the S3 URL and ensure the file exists

2. **Access Denied (403)**
   ```
   "Failed to download file from URL: https://bucket.s3.amazonaws.com/file.pdf. Error: Failed to download file: HTTP 403"
   ```
   **Solution:** Ensure the S3 object is publicly accessible or use presigned URLs

3. **Download Timeout**
   ```
   "Failed to download file from URL: https://bucket.s3.amazonaws.com/file.pdf. Error: Download timeout"
   ```
   **Solution:** Check network connectivity or increase timeout

4. **File Too Large**
   ```
   "File size exceeds WhatsApp limits"
   ```
   **Solution:** Compress the PDF or split it into smaller files

## Best Practices

### 1. **Use Public S3 URLs**
```json
{
  "response_msg": "https://my-bucket.s3.amazonaws.com/public/documents/report.pdf"
}
```

### 2. **Set Proper S3 Permissions**
```bash
# Make S3 object publicly readable
aws s3 cp document.pdf s3://my-bucket/public/documents/ --acl public-read
```

### 3. **Use CloudFront for Better Performance**
```json
{
  "response_msg": "https://d1234.cloudfront.net/documents/report.pdf"
}
```

### 4. **Handle Large Files**
```javascript
// Check file size before sending
const response = await fetch(s3Url, { method: 'HEAD' });
const contentLength = response.headers.get('content-length');
if (parseInt(contentLength) > 16 * 1024 * 1024) {
  throw new Error('File too large for WhatsApp');
}
```

### 5. **Use Descriptive Filenames**
```json
{
  "options": {
    "fileName": "Monthly_Report_January_2024.pdf"
  }
}
```

## Testing

### Test with S3 URL
```bash
curl -X POST http://localhost:8080/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "instanceId": "your-instance-id",
    "response_msg": "https://your-bucket.s3.amazonaws.com/test.pdf",
    "options": {
      "messageType": "pdf",
      "fileName": "test-document.pdf"
    }
  }'
```

### Test with CloudFront URL
```bash
curl -X POST http://localhost:8080/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "instanceId": "your-instance-id",
    "response_msg": "https://d1234.cloudfront.net/documents/report.pdf",
    "options": {
      "messageType": "pdf",
      "fileName": "report.pdf"
    }
  }'
```

## Migration from URL-Only

### Before (URL-based)
```json
{
  "response_msg": "https://s3.amazonaws.com/bucket/document.pdf",
  "options": {
    "messageType": "pdf"
  }
}
```

### After (Download-based)
```json
{
  "response_msg": "https://s3.amazonaws.com/bucket/document.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "document.pdf"
  }
}
```

**Note:** The API call remains the same, but the system now downloads and sends the actual file content.

## Performance Considerations

### Download Timeouts
- Default timeout: 30 seconds
- Large files may need more time
- Network conditions affect download speed

### Memory Usage
- Files are loaded into memory temporarily
- Large files consume more memory
- Consider file size limits

### Network Bandwidth
- Downloads consume bandwidth
- Consider using CloudFront for better performance
- Monitor download times

## Troubleshooting

### S3 Access Issues
```bash
# Test S3 URL accessibility
curl -I https://your-bucket.s3.amazonaws.com/document.pdf
```

### CloudFront Issues
```bash
# Test CloudFront URL
curl -I https://d1234.cloudfront.net/documents/report.pdf
```

### Network Issues
```bash
# Check network connectivity
ping s3.amazonaws.com
```

## Examples in Different Languages

### Python
```python
import requests

# Send PDF from S3 URL
response = requests.post('http://localhost:8080/api/send', json={
    'instanceId': 'your-instance-id',
    'response_msg': 'https://your-bucket.s3.amazonaws.com/document.pdf',
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
    response_msg: 'https://your-bucket.s3.amazonaws.com/document.pdf',
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
    'response_msg' => 'https://your-bucket.s3.amazonaws.com/document.pdf',
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

This enhancement makes your WhatsApp service much more robust for handling S3-hosted PDF documents! 