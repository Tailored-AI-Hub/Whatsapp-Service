# WhatsApp Service - Local Storage Configuration

This document describes the local storage configuration for the WhatsApp service, which has been updated to store authentication folders locally instead of using S3.

## Changes Made

### Removed S3 Dependencies
- Removed `@aws-sdk/client-s3`, `@aws-sdk/client-sqs`, `@aws-sdk/client-cloudwatch-logs`
- Removed `multer-s3` and `winston-cloudwatch` dependencies
- Deleted `s3Service.js` and `authFolderManager.js` files

### New Local Storage System
- Created `localAuthFolderManager.js` for local file system operations
- Auth folders are now stored in `./auth_backups/` directory
- Backups are encrypted using AES-256-CBC encryption
- Automatic cleanup keeps only the latest 5 backups per instance

## Directory Structure

```
StandaloneWhatsappService/
├── auth_info/                    # Active auth folders
│   ├── tenant_123/              # Tenant-specific folders
│   │   └── auth_info_baileys_instance1/
│   └── auth_info_baileys_instance2/  # Non-tenant instances
├── auth_backups/                 # Encrypted backup files
│   ├── auth_info_instance1_1234567890_encrypted.zip
│   └── auth_info_instance2_1234567890_encrypted.zip
└── services/
    ├── localAuthFolderManager.js # Local storage management
    └── whatsappManager.js        # Updated to use local storage
```

## Configuration

### Environment Variables

The following environment variables are still required:

```bash
# Encryption key for auth folder backups (64 hex characters)
ENCRYPTION_KEY=your_32_byte_encryption_key_here

# Other existing environment variables...
NODE_ENV=development
PORT=8080
```

### Encryption Key Setup

Generate a 32-byte encryption key (64 hex characters):

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 32
```

## Features

### Automatic Backup
- Auth folders are automatically backed up 30 seconds after successful connection
- Backups are encrypted and stored locally
- Old backups are automatically cleaned up (keeps latest 5)

### Manual Operations

#### List Backups for an Instance
```javascript
const { listInstanceBackups } = require('./services/whatsappManager');

const result = listInstanceBackups('instance_id');
if (result.success) {
  console.log('Backups:', result.backups);
} else {
  console.error('Error:', result.error);
}
```

#### Restore Auth Folder from Backup
```javascript
const { restoreInstanceAuthFolder } = require('./services/whatsappManager');

const result = await restoreInstanceAuthFolder('instance_id', 'tenant_id');
if (result.success) {
  console.log('Auth folder restored successfully');
} else {
  console.error('Error:', result.error);
}
```

#### Manual Backup
```javascript
const localAuthFolderManager = require('./services/localAuthFolderManager');

const result = await localAuthFolderManager.backupInstanceAuthFolder('instance_id', 'tenant_id');
console.log('Backup created:', result);
```

#### Cleanup Old Backups
```javascript
const localAuthFolderManager = require('./services/localAuthFolderManager');

const deletedCount = await localAuthFolderManager.cleanupInstanceBackups('instance_id', 3);
console.log(`Deleted ${deletedCount} old backups`);
```

## Migration from S3

If you were previously using S3 storage:

1. **Export existing auth folders**: Download your auth folders from S3 before switching
2. **Place in local structure**: Put the auth folders in the appropriate `./auth_info/` directory structure
3. **Update environment**: Remove S3-related environment variables and add the encryption key
4. **Restart service**: The service will now use local storage

## Security Considerations

- Auth folders are encrypted before being stored as backups
- Use a strong encryption key and keep it secure
- Consider backing up the `auth_backups/` directory to a secure location
- Regularly rotate the encryption key

## Monitoring

The service logs backup operations:

```
INFO: Auth folder for instance instance1 encrypted and backed up locally
INFO: Cleaned up 2 old backups for instance instance1
INFO: Auth folder for instance instance1 restored from local backup
```

## Troubleshooting

### Missing Encryption Key
```
Error: Invalid encryption key length. Must be 32 bytes (64 hex characters)
```
Solution: Set the `ENCRYPTION_KEY` environment variable with a valid 32-byte hex key.

### Backup Directory Issues
```
Error: ENOENT: no such file or directory, open './auth_backups/...'
```
Solution: The service will automatically create the backup directory, but ensure the process has write permissions.

### Restore Failures
```
Error: No backup found for instance instance1
```
Solution: Check if backups exist in the `./auth_backups/` directory for the given instance.

## Performance Notes

- Local storage is faster than S3 for read/write operations
- Backup files are compressed and encrypted
- Automatic cleanup prevents disk space issues
- Consider monitoring disk usage for the backup directory 