# WhatsApp Service API Documentation

## Overview

The WhatsApp Service is a standalone microservice that provides WhatsApp integration capabilities. It supports multiple WhatsApp instances, message sending (text, polls, images, documents), and connection management.

**Base URL**: `http://localhost:8080` (configurable via PORT environment variable)

## Authentication

The service uses JWT-based authentication. Include the token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Note**: In development mode, authentication can be skipped by setting `SKIP_AUTH=true` in environment variables.

## Rate Limiting

API endpoints are rate-limited to 100 requests per 15-minute window by default. Rate limits can be configured via environment variables:
- `RATE_LIMIT_WINDOW_MS`: Time window in milliseconds
- `RATE_LIMIT_MAX`: Maximum requests per window

## Health & Monitoring Endpoints

### 1. Health Check
**Endpoint**: `GET /ready`

**Description**: Basic health check endpoint (no authentication required)

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "whatsapp-service",
  "connections": 5
}
```

### 2. Metrics
**Endpoint**: `GET /metrics`

**Description**: System metrics for monitoring (no authentication required)

**Response**:
```json
{
  "uptime_seconds": 3600,
  "memory_usage_mb": 45.2,
  "heap_used_mb": 23.1,
  "total_connections": 5,
  "connection_states": {
    "open": 3,
    "connecting": 1,
    "closed": 1
  },
  "timestamp": 1704110400000
}
```

### 3. Connection Status
**Endpoint**: `GET /connection-status`

**Description**: Check status of specific WhatsApp instances (no authentication required)

**Query Parameters**:
- `instanceId` (required): Comma-separated list of instance IDs

**Example**: `GET /connection-status?instanceId=instance1,instance2`

**Response**:
```json
{
  "status": "ok",
  "instances": [
    {
      "id": "instance1",
      "state": "open",
      "phoneNumber": "+1234567890"
    },
    {
      "id": "instance2", 
      "state": "connecting",
      "phoneNumber": null
    }
  ]
}
```

## WhatsApp Instance Management

### 1. Get All Instances
**Endpoint**: `GET /api/instances`

**Description**: Retrieve all WhatsApp instances

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "instances": [
    {
      "instanceId": "uuid-1",
      "state": "open",
      "phoneNumber": "+1234567890",
      "tenantId": "tenant-123"
    }
  ]
}
```

### 2. Get Specific Instance
**Endpoint**: `GET /api/instances/:instanceId`

**Description**: Get details of a specific WhatsApp instance

**Authentication**: Required

**Path Parameters**:
- `instanceId`: Unique identifier of the instance

**Response**:
```json
{
  "success": true,
  "instance": {
    "instanceId": "uuid-1",
    "state": "open",
    "phoneNumber": "+1234567890",
    "tenantId": "tenant-123"
  }
}
```

**Error Response** (404):
```json
{
  "success": false,
  "message": "Instance not found"
}
```

### 3. Get QR Code
**Endpoint**: `GET /api/instances/:instanceId/qr`

**Description**: Get QR code for WhatsApp authentication

**Authentication**: Required

**Path Parameters**:
- `instanceId`: Unique identifier of the instance

**Response**:
```json
{
  "success": true,
  "instanceId": "uuid-1",
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### 4. Create Instance
**Endpoint**: `POST /api/create-instance`

**Description**: Create a new WhatsApp instance

**Authentication**: Required

**Request Body**:
```json
{
  "tenantId": "tenant-123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "WhatsApp connection initiated",
  "instanceId": "uuid-1",
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### 5. Reconnect Instance
**Endpoint**: `POST /api/instances/:instanceId/reconnect`

**Description**: Reconnect a WhatsApp instance

**Authentication**: Required

**Path Parameters**:
- `instanceId`: Unique identifier of the instance

**Response**:
```json
{
  "success": true,
  "message": "Reconnection initiated",
  "instanceId": "uuid-1"
}
```

### 6. Restart Instance
**Endpoint**: `POST /api/instances/restart`

**Description**: Restart a WhatsApp instance

**Authentication**: Required

**Request Body**:
```json
{
  "instanceId": "uuid-1",
  "tenantId": "tenant-123"
}
```

### 7. Delete Instance
**Endpoint**: `DELETE /api/instances/:instanceId`

**Description**: Delete a WhatsApp instance

**Authentication**: Required

**Path Parameters**:
- `instanceId`: Unique identifier of the instance

**Response**:
```json
{
  "success": true,
  "message": "Instance deleted successfully"
}
```

## Message Sending

### Send Message
**Endpoint**: `POST /api/send`

**Description**: Send various types of messages (text, polls, images, documents)

**Authentication**: Required

**Request Body**:
```json
{
  "instanceId": "uuid-1",
  "message_object": {
    "key": {
      "remoteJid": "group_id@g.us",
      "id": "message_id_to_reply_to"
    }
  },
  "response_msg": "Your message content",
  "to": "phone_number@c.us",
  "options": {
    "messageType": "text"
  }
}
```

**Parameters**:
- `instanceId` (required): WhatsApp instance ID
- `message_object` (optional): Message to reply to
- `response_msg` (required): Message content
- `to` (optional): Recipient phone number
- `options` (optional): Message options

### Message Types

#### 1. Text Messages
```json
{
  "instanceId": "uuid-1",
  "response_msg": "Hello, this is a text message",
  "options": {
    "messageType": "text"
  }
}
```

#### 2. Poll Messages
```json
{
  "instanceId": "uuid-1",
  "response_msg": {
    "name": "Meeting time preference?",
    "options": ["9 AM", "10 AM", "11 AM", "2 PM", "3 PM"],
    "selectableCount": 2
  },
  "options": {
    "messageType": "poll"
  }
}
```

**Poll Validation Rules**:
- `name`: Required poll question
- `options`: Array of 2-12 options
- `selectableCount`: Number of selectable options (1 to options.length)

#### 3. Image Messages
```json
{
  "instanceId": "uuid-1",
  "response_msg": "https://example.com/image.jpg",
  "options": {
    "messageType": "image",
    "caption": "Optional image caption"
  }
}
```

**Image Formats**:
- URL string: `"https://example.com/image.jpg"`
- Object with URL: `{"url": "https://example.com/image.jpg", "caption": "Caption"}`
- File path: `"/path/to/local/image.jpg"`

#### 4. Document/PDF Messages
```json
{
  "instanceId": "uuid-1",
  "response_msg": "https://example.com/document.pdf",
  "options": {
    "messageType": "pdf",
    "fileName": "my-document.pdf",
    "mimetype": "application/pdf"
  }
}
```

**Document Formats**:
- URL string: `"https://example.com/document.pdf"`
- Object with URL: `{"url": "https://example.com/document.pdf", "fileName": "doc.pdf"}`
- File path: `"/path/to/local/document.pdf"`

**Response**:
```json
{
  "success": true,
  "message": "Message sent successfully",
  "result": {
    "key": {
      "remoteJid": "phone_number@c.us",
      "id": "message_id"
    }
  }
}
```

## Chat Management

### Get Instance Chats
**Endpoint**: `GET /api/instances/:phoneNumber/chats`

**Description**: Get all chats for a specific phone number

**Authentication**: Required

**Path Parameters**:
- `phoneNumber`: Phone number in format without @c.us suffix

**Response**:
```json
{
  "success": true,
  "chats": [
    {
      "id": "phone_number@c.us",
      "name": "Contact Name",
      "unreadCount": 5
    }
  ]
}
```

## Admin Endpoints

### System Information
**Endpoint**: `GET /api/admin/system-info`

**Description**: Get system information (admin access required)

**Authentication**: Required (Admin role)

**Response**:
```json
{
  "success": true,
  "systemInfo": {
    "uptime": 3600,
    "memoryUsage": {
      "rss": 47349760,
      "heapTotal": 23461888,
      "heapUsed": 12345678,
      "external": 1234567
    },
    "nodeVersion": "v18.17.0",
    "instanceCount": 5,
    "environment": "production"
  }
}
```

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8080 |
| `NODE_ENV` | Environment mode | development |
| `JWT_SECRET` | JWT signing secret | Required |
| `SKIP_AUTH` | Skip authentication in dev | true |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 60000 |
| `RATE_LIMIT_MAX` | Rate limit max requests | 100 |

## Dependencies

The service uses the following key dependencies:
- `@whiskeysockets/baileys`: WhatsApp Web API library
- `express`: Web framework
- `helmet`: Security middleware
- `cors`: Cross-origin resource sharing
- `express-rate-limit`: Rate limiting
- `jsonwebtoken`: JWT authentication
- `qrcode`: QR code generation
- `winston`: Logging

## Security Features

1. **Helmet**: Security headers
2. **CORS**: Cross-origin protection
3. **Rate Limiting**: API abuse prevention
4. **JWT Authentication**: Token-based auth
5. **Input Validation**: Request validation
6. **Error Handling**: Secure error responses

## Connection Management

The service automatically:
- Restores existing connections on startup
- Manages connection states
- Handles reconnection logic
- Stores authentication data locally
- Supports multi-tenant instances

## Message Storage

For poll messages, the service stores message data to enable vote decryption. Messages are stored in memory with a limit of 500 messages to prevent memory leaks.

## Logging

The service uses Winston for structured logging with different log levels:
- `error`: Error conditions
- `warn`: Warning conditions  
- `info`: General information
- `debug`: Debug information

Logs are written to both console and log files in the `logs/` directory. 