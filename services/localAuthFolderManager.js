const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const archiver = require('archiver');
const extract = require('extract-zip');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Local backup directory for auth folders
 */
const LOCAL_BACKUP_DIR = './auth_backups';

/**
 * Ensure backup directory exists
 */
function ensureBackupDirectory() {
  if (!fs.existsSync(LOCAL_BACKUP_DIR)) {
    fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  }
}

/**
 * Zips a specific instance's auth folder
 * @param {string} instanceId - The instance ID
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<{path: string, buffer: Buffer}>} - Path to the zip file and its buffer
 */
async function zipInstanceAuthFolder(instanceId, tenantId = null) {
  const authFolderPath = tenantId
    ? `./auth_info/tenant_${tenantId}/auth_info_baileys_${instanceId}`
    : `./auth_info/auth_info_baileys_${instanceId}`;

  return new Promise((resolve, reject) => {
    try {
      // Check if the folder exists
      if (!fs.existsSync(authFolderPath)) {
        return reject(new Error(`Auth folder for instance ${instanceId} not found`));
      }

      // Create a temporary zip file
      const zipFilePath = path.join(os.tmpdir(), `auth_info_${instanceId}_${Date.now()}.zip`);
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        try {
          const buffer = fs.readFileSync(zipFilePath);
          resolve({ path: zipFilePath, buffer });
        } catch (error) {
          reject(error);
        }
      });

      archive.on('error', (err) => {
        reject(err);
      });

      // Pipe archive data to the file
      archive.pipe(output);

      // Add the instance's auth folder contents to the archive
      // Include tenant folder structure in the archive if it exists
      const archivePath = tenantId
        ? `tenant_${tenantId}/auth_info_baileys_${instanceId}`
        : `auth_info_baileys_${instanceId}`;

      archive.directory(authFolderPath, archivePath);

      // Finalize the archive
      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Encrypts a buffer using AES-256-CBC
 * @param {Buffer} buffer - Buffer to encrypt
 * @returns {Buffer} - Encrypted buffer with IV prepended
 */
function encryptBuffer(buffer) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

    if (key.length !== 32) {
      throw new Error('Invalid encryption key length. Must be 32 bytes (64 hex characters)');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
  } catch (error) {
    logger.error('Encryption error', { error: error.stack });
    throw error;
  }
}

/**
 * Decrypts a buffer using AES-256-CBC
 * @param {Buffer} encryptedBuffer - Buffer to decrypt (with IV prepended)
 * @returns {Buffer} - Decrypted buffer
 */
async function decryptBuffer(encryptedBuffer) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

    if (key.length !== 32) {
      throw new Error('Invalid encryption key length. Must be 32 bytes (64 hex characters)');
    }

    // Extract IV from the beginning of the buffer
    const iv = encryptedBuffer.slice(0, 16);
    const encryptedData = encryptedBuffer.slice(16);

    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  } catch (error) {
    logger.error('Decryption error', { error: error.stack });
    throw error;
  }
}

/**
 * Backs up a specific instance's auth folder locally with encryption
 * @param {string} instanceId - The instance ID
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<Object>} - Backup file info
 */
async function backupInstanceAuthFolder(instanceId, tenantId = null) {
  try {
    ensureBackupDirectory();

    // Zip the instance's auth folder
    const { path: zipFilePath, buffer: zipBuffer } = await zipInstanceAuthFolder(
      instanceId,
      tenantId
    );

    try {
      // Encrypt the buffer
      const encryptedBuffer = encryptBuffer(zipBuffer);

      // Create backup filename
      const backupFilename = `auth_info_${instanceId}_${Date.now()}_encrypted.zip`;
      const backupPath = path.join(LOCAL_BACKUP_DIR, backupFilename);

      // Save encrypted backup locally
      fs.writeFileSync(backupPath, encryptedBuffer);

      // Clean up the temporary zip file
      fs.unlinkSync(zipFilePath);

      logger.info(`Auth folder for instance ${instanceId} encrypted and backed up locally`, {
        instanceId,
        backupPath,
        size: encryptedBuffer.length,
      });

      return {
        instanceId,
        backupPath,
        filename: backupFilename,
        size: encryptedBuffer.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      // Clean up the temporary zip file in case of error
      if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
      }
      throw error;
    }
  } catch (error) {
    logger.error(`Error backing up auth folder for instance ${instanceId} locally`, {
      error: error.stack,
      instanceId,
    });
    throw error;
  }
}

/**
 * Restores a specific instance's auth folder from local backup
 * @param {string} instanceId - The instance ID
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<boolean>} - Success status
 */
async function restoreInstanceAuthFolder(instanceId, tenantId = null) {
  try {
    ensureBackupDirectory();

    const authFolderPath = tenantId
      ? `./auth_info/tenant_${tenantId}/auth_info_baileys_${instanceId}`
      : `./auth_info/auth_info_baileys_${instanceId}`;

    // Find the most recent backup for this instance
    const backupFiles = fs.readdirSync(LOCAL_BACKUP_DIR)
      .filter(file => file.startsWith(`auth_info_${instanceId}_`) && file.endsWith('_encrypted.zip'))
      .sort()
      .reverse();

    if (backupFiles.length === 0) {
      throw new Error(`No backup found for instance ${instanceId}`);
    }

    const latestBackupFile = backupFiles[0];
    const backupPath = path.join(LOCAL_BACKUP_DIR, latestBackupFile);

    // Read the encrypted backup
    const encryptedBuffer = fs.readFileSync(backupPath);

    // Decrypt the buffer
    const decryptedBuffer = await decryptBuffer(encryptedBuffer);

    // Save to a temporary file
    const tempZipPath = path.join(
      os.tmpdir(),
      `auth_info_${instanceId}_restore_${Date.now()}.zip`
    );
    fs.writeFileSync(tempZipPath, decryptedBuffer);

    try {
      // Create tenant directory structure if needed
      if (tenantId) {
        const tenantFolder = path.dirname(authFolderPath);
        if (!fs.existsSync(tenantFolder)) {
          fs.mkdirSync(tenantFolder, { recursive: true });
        }
      }

      // Extract the zip file
      await extract(tempZipPath, { dir: path.resolve('./auth_info') });

      // Clean up the temporary zip file
      fs.unlinkSync(tempZipPath);

      logger.info(`Auth folder for instance ${instanceId} restored from local backup`, {
        instanceId,
        tenantId,
        path: authFolderPath,
        backupFile: latestBackupFile,
      });

      return true;
    } catch (error) {
      // Clean up the temporary zip file in case of error
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
      throw error;
    }
  } catch (error) {
    logger.error(`Error restoring auth folder for instance ${instanceId} from local backup`, {
      error: error.stack,
      instanceId,
      tenantId,
    });
    throw error;
  }
}

/**
 * Lists all available backups for a specific instance
 * @param {string} instanceId - The instance ID
 * @returns {Array} - Array of backup information
 */
function listInstanceBackups(instanceId) {
  try {
    ensureBackupDirectory();

    const backupFiles = fs.readdirSync(LOCAL_BACKUP_DIR)
      .filter(file => file.startsWith(`auth_info_${instanceId}_`) && file.endsWith('_encrypted.zip'))
      .map(file => {
        const filePath = path.join(LOCAL_BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    return backupFiles;
  } catch (error) {
    logger.error(`Error listing backups for instance ${instanceId}`, {
      error: error.stack,
      instanceId,
    });
    return [];
  }
}

/**
 * Deletes old backups for a specific instance (keeps only the latest N)
 * @param {string} instanceId - The instance ID
 * @param {number} keepCount - Number of backups to keep
 * @returns {Promise<number>} - Number of backups deleted
 */
async function cleanupInstanceBackups(instanceId, keepCount = 5) {
  try {
    const backups = listInstanceBackups(instanceId);
    
    if (backups.length <= keepCount) {
      return 0;
    }

    const backupsToDelete = backups.slice(keepCount);
    let deletedCount = 0;

    for (const backup of backupsToDelete) {
      try {
        fs.unlinkSync(backup.path);
        deletedCount++;
        logger.info(`Deleted old backup: ${backup.filename}`, { instanceId });
      } catch (error) {
        logger.error(`Error deleting backup ${backup.filename}`, {
          error: error.message,
          instanceId,
        });
      }
    }

    logger.info(`Cleaned up ${deletedCount} old backups for instance ${instanceId}`, {
      instanceId,
      deletedCount,
      remainingCount: backups.length - deletedCount,
    });

    return deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up backups for instance ${instanceId}`, {
      error: error.stack,
      instanceId,
    });
    return 0;
  }
}

/**
 * Checks for missing auth folders and restores them from local backups
 * @param {Array} instances - Array of instance objects to check
 * @returns {Promise<{checked: number, restored: number, failed: number}>} - Status counts
 */
async function checkAndRestoreMissingAuthFolders(instances = []) {
  try {
    const results = {
      checked: 0,
      restored: 0,
      failed: 0,
    };

    for (const instance of instances) {
      results.checked++;
      const authFolderPath = instance.tenantId
        ? `./auth_info/tenant_${instance.tenantId}/auth_info_baileys_${instance.instanceId}`
        : `./auth_info/auth_info_baileys_${instance.instanceId}`;

      if (!fs.existsSync(authFolderPath)) {
        logger.info(
          `Auth folder missing for instance ${instance.instanceId}, attempting to restore from local backup`
        );

        try {
          await restoreInstanceAuthFolder(instance.instanceId, instance.tenantId);
          results.restored++;
          logger.info(
            `Successfully restored auth folder for instance ${instance.instanceId}`
          );
        } catch (error) {
          results.failed++;
          logger.error(`Failed to restore auth folder for instance ${instance.instanceId}`, {
            error: error.message,
            tenantId: instance.tenantId,
          });
        }
      }
    }

    logger.info('Local auth folder check completed', results);
    return results;
  } catch (error) {
    logger.error('Error checking for missing auth folders', { error: error.stack });
    return { checked: 0, restored: 0, failed: 0 };
  }
}

module.exports = {
  zipInstanceAuthFolder,
  backupInstanceAuthFolder,
  restoreInstanceAuthFolder,
  listInstanceBackups,
  cleanupInstanceBackups,
  checkAndRestoreMissingAuthFolders,
  encryptBuffer,
  decryptBuffer,
}; 