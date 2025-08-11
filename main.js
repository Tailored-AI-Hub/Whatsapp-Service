const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const localAuthFolderManager = require('./services/localAuthFolderManager');
// Load environment variables
dotenv.config();

// Import services
const whatsappManager = require('./services/whatsappManager');

// Import middleware
const { authenticate, requireAdmin } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimiter');

// Import utilities
const logger = require('./utils/logger');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure trust proxy
app.set('trust proxy', 'loopback, linklocal, uniquelocal'); // Trust Nginx and other local proxies

// Configure middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure rate limiters
const apiLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 });

// Health check endpoint (no auth required)
app.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'whatsapp-service',
    connections: whatsappManager.connections.size,
  });
});

// Add a metrics endpoint for Kubernetes/Prometheus monitoring
app.get('/metrics', (req, res) => {
  const metrics = {
    // System metrics
    uptime_seconds: process.uptime(),
    memory_usage_mb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
    heap_used_mb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,

    // Application metrics
    total_connections: whatsappManager.connections.size,
    connection_states: Array.from(whatsappManager.connections.entries()).reduce(
      (acc, [_, conn]) => {
        const state = conn.state || 'unknown';
        acc[state] = (acc[state] || 0) + 1;
        return acc;
      },
      {}
    ),
    timestamp: Date.now(),
  };
  res.status(200).json(metrics);
});

// Connection status endpoint (no auth required)
app.get('/connection-status', (req, res) => {
  const instanceIds = req.query.instanceId;
  if (!instanceIds) {
    return res.status(400).json({ error: 'Instance ID(s) are required' });
  }
  const instances = Array.from(whatsappManager.connections.entries())
    .filter(([id]) => instanceIds.includes(id))
    .map(([id, conn]) => ({
      id,
      state: conn.state,
      phoneNumber: conn.phoneNumber,
    }));
  res.status(200).json({
    status: 'ok',
    instances,
  });
});

// API routes (with authentication)
const apiRouter = express.Router();
app.use('/api', apiLimiter, apiRouter);

// WhatsApp instance management routes
apiRouter.get('/instances', authenticate, (req, res) => {
  try {
    const instances = whatsappManager.getAllInstances();
    res.json({ success: true, instances });
  } catch (error) {
    logger.error('Error getting instances', { error: error.stack });
    res.status(500).json({ success: false, message: 'Failed to get instances' });
  }
});

apiRouter.get('/instances/:instanceId', authenticate, (req, res) => {
  try {
    const instance = whatsappManager.getInstance(req.params.instanceId);
    if (!instance) {
      return res.status(404).json({ success: false, message: 'Instance not found' });
    }
    res.json({ success: true, instance });
  } catch (error) {
    logger.error('Error getting instance', {
      error: error.stack,
      instanceId: req.params.instanceId,
    });
    res.status(500).json({ success: false, message: 'Failed to get instance' });
  }
});

apiRouter.get('/instances/:instanceId/qr', authenticate, (req, res) => {
  try {
    const instance = whatsappManager.getInstance(req.params.instanceId);
    if (!instance) {
      return res.status(404).json({ success: false, message: 'Instance not found' });
    }

    res.json({
      success: true,
      instanceId: req.params.instanceId,
      qr: instance.qr || null,
    });
  } catch (error) {
    logger.error('Error getting QR code', {
      error: error.stack,
      instanceId: req.params.instanceId,
    });
    res.status(500).json({ success: false, message: 'Failed to get QR code' });
  }
});

apiRouter.post('/create-instance', authenticate, async (req, res) => {
  try {
    const tenantId = req.body.tenantId || undefined;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }
    const instanceId = uuidv4();

    // Initialize the connection and wait for it to be ready
    await whatsappManager.initializeConnection(instanceId, tenantId);

    // Get the instance after initialization is complete
    const instance = whatsappManager.getInstance(instanceId);

    res.json({
      success: true,
      message: 'WhatsApp connection initiated',
      instanceId: instance.instanceId,
      qr: instance.qr,
    });
  } catch (error) {
    logger.error('Error creating instance', { error: error.stack });
    res.status(500).json({ success: false, message: 'Failed to create instance' });
  }
});

apiRouter.post('/instances/:instanceId/reconnect', authenticate, async (req, res) => {
  try {
    logger.info('Reconnect requested via API', { instanceId: req.params.instanceId });

    // Check if instance exists
    if (!whatsappManager.connections.has(req.params.instanceId)) {
      return res.status(404).json({ success: false, message: 'Instance not found' });
    }

    // Attempt to reconnect
    await whatsappManager.connectToWhatsApp(req.params.instanceId);

    res.json({
      success: true,
      message: 'Reconnection initiated',
      instanceId: req.params.instanceId,
    });
  } catch (error) {
    logger.error('Error reconnecting', { error: error.stack, instanceId: req.params.instanceId });
    res.status(500).json({ success: false, message: 'Failed to reconnect instance' });
  }
});

apiRouter.post('/instances/restart', authenticate, async (req, res) => {
  try {
    const instanceId = req.body.instanceId;
    const tenantId = req.body.tenantId;
    await whatsappManager.connectToWhatsApp(instanceId, tenantId);
  } catch (error) {
    logger.error('Error restarting instance', {
      error: error.stack,
      instanceId: req.body.instanceId,
    });
    res.status(500).json({ success: false, message: 'Failed to restart instance' });
  }
});

apiRouter.delete('/instances/:instanceId', authenticate, (req, res) => {
  try {
    const success = whatsappManager.deleteInstance(req.params.instanceId);
    if (!success) {
      return res
        .status(404)
        .json({ success: false, message: 'Instance not found or access denied' });
    }
    res.json({ success: true, message: 'Instance deleted successfully' });
  } catch (error) {
    logger.error('Error deleting instance', {
      error: error.stack,
      instanceId: req.params.instanceId,
    });
    res.status(500).json({ success: false, message: 'Failed to delete instance' });
  }
});

// '''curl -X POST http://localhost:8080/api/send \
//   -H "Content-Type: application/json" \
//   -H "Authorization: Bearer YOUR_TOKEN" \
//   -d {
//     "instanceId": "your-instance-id",
//     "message_object": {
//       "key": {
//         "remoteJid": "group_id@g.us",
//         "id": "message_id_to_reply_to"
//       }
//     },
//     "response_msg": {
//       "name": "Meeting time preference?",
//       "options": ["9 AM", "10 AM", "11 AM", "2 PM", "3 PM"],
//       "selectableCount": 2
//     },
//     "options": {
//       "messageType": "poll"
//     }
//   }
// '''

// Message sending route
apiRouter.post('/send', authenticate, async (req, res) => {
  try {
    const { instanceId, message_object, response_msg, to = undefined, options = {} } = req.body;

    if (!instanceId || !response_msg) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: instanceId, response_msg',
      });
    }

    // Validate poll data if messageType is poll
    if (options.messageType === 'poll') {
      if (!response_msg.name || !response_msg.options || !Array.isArray(response_msg.options)) {
        return res.status(400).json({
          success: false,
          message: 'Poll requires name and options array',
        });
      }

      if (response_msg.options.length < 2 || response_msg.options.length > 12) {
        return res.status(400).json({
          success: false,
          message: 'Poll must have between 2 and 12 options',
        });
      }

      // Validate selectableCount
      const selectableCount = response_msg.selectableCount || 1;
      if (selectableCount < 1 || selectableCount > response_msg.options.length) {
        return res.status(400).json({
          success: false,
          message: 'selectableCount must be between 1 and the number of options',
        });
      }
    }

    // Validate image data if messageType is image
    if (options.messageType === 'image') {
      if (typeof response_msg === 'string') {
        // Check if it's a URL or file path
        if (response_msg.startsWith('http://') || response_msg.startsWith('https://')) {
          // Validate URL format
          try {
            new URL(response_msg);
          } catch (error) {
            return res.status(400).json({
              success: false,
              message: 'Invalid image URL format',
            });
          }
        } else {
          // It's a file path - check if file exists
          const fs = require('fs');
          if (!fs.existsSync(response_msg)) {
            return res.status(400).json({
              success: false,
              message: `Image file not found at path: ${response_msg}`,
            });
          }
        }
      } else if (response_msg && typeof response_msg === 'object') {
        if (response_msg.url) {
          // Check if it's a URL or file path
          if (response_msg.url.startsWith('http://') || response_msg.url.startsWith('https://')) {
            // Validate URL format
            try {
              new URL(response_msg.url);
            } catch (error) {
              return res.status(400).json({
                success: false,
                message: 'Invalid image URL format in response_msg object',
              });
            }
          } else {
            // It's a file path - check if file exists
            const fs = require('fs');
            if (!fs.existsSync(response_msg.url)) {
              return res.status(400).json({
                success: false,
                message: `Image file not found at path: ${response_msg.url}`,
              });
            }
          }
        } else if (!response_msg.buffer && !response_msg.data) {
          return res.status(400).json({
            success: false,
            message: 'Image requires a valid URL, file path, or object with url/buffer property',
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Image requires a valid URL, file path, or object with url/buffer property',
        });
      }
    }

    // Validate document/PDF data if messageType is document or pdf
    if (options.messageType === 'document' || options.messageType === 'pdf') {
      if (typeof response_msg === 'string') {
        // Check if it's a URL or file path
        if (response_msg.startsWith('http://') || response_msg.startsWith('https://')) {
          // Validate URL format
          try {
            new URL(response_msg);
          } catch (error) {
            return res.status(400).json({
              success: false,
              message: 'Invalid document URL format',
            });
          }
        } else {
          // It's a file path - check if file exists
          const fs = require('fs');
          if (!fs.existsSync(response_msg)) {
            return res.status(400).json({
              success: false,
              message: `Document file not found at path: ${response_msg}`,
            });
          }
        }
      } else if (response_msg && typeof response_msg === 'object') {
        if (response_msg.url) {
          // Check if it's a URL or file path
          if (response_msg.url.startsWith('http://') || response_msg.url.startsWith('https://')) {
            // Validate URL format
            try {
              new URL(response_msg.url);
            } catch (error) {
              return res.status(400).json({
                success: false,
                message: 'Invalid document URL format in response_msg object',
              });
            }
          } else {
            // It's a file path - check if file exists
            const fs = require('fs');
            if (!fs.existsSync(response_msg.url)) {
              return res.status(400).json({
                success: false,
                message: `Document file not found at path: ${response_msg.url}`,
              });
            }
          }
        } else if (!response_msg.buffer && !response_msg.data) {
          return res.status(400).json({
            success: false,
            message: 'Document requires a valid URL, file path, or object with url/buffer property',
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Document requires a valid URL, file path, or object with url/buffer property',
        });
      }
    }

    // Parse message_object if it's a string
    let parsedMessageObject = message_object;
    if (message_object && typeof message_object === 'string') {
      try {
        parsedMessageObject = JSON.parse(message_object);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid message_object format: could not parse JSON',
        });
      }
    }

    const result = await whatsappManager.sendMessage(
      instanceId,
      response_msg,
      parsedMessageObject,
      to,
      options
    );
    if (result.success) {
      await whatsappManager.storeMessage(
        result.result,
        instanceId,
        message_object?.key?.id,
        response_msg?.options
      );
      res.json({
        success: true,
        message: 'Message sent successfully',
        result,
      });
    } else {
      res.status(500).json({ success: false, message: result.error });
    }
  } catch (error) {
    logger.error('Error sending message', { error: error.stack });
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all chats for a specific instance
apiRouter.get('/instances/:phoneNumber/chats', authenticate, async (req, res) => {
  try {
    const result = await whatsappManager.getInstanceChats(req.params.phoneNumber);
    if (result.success) {
      res.json({
        success: true,
        chats: result.chats,
      });
    } else {
      const statusCode = result.error.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Error getting chats', {
      error: error.stack,
      phoneNumber: req.params.phoneNumber,
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get chats',
    });
  }
});

// Admin-only routes
const adminRouter = express.Router();
apiRouter.use('/admin', authenticate, requireAdmin, adminRouter);

adminRouter.get('/system-info', (req, res) => {
  const systemInfo = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    instanceCount: whatsappManager.connections.size,
    environment: process.env.NODE_ENV || 'development',
  };

  res.json({ success: true, systemInfo });
});

// Error handling middleware
app.use((err, req, res, _) => {
  logger.error('Unhandled error', { error: err.stack, path: req.path });
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start the server
const PORT = 8080;
logger.info(`PORT: ${PORT}`);
server.listen(PORT, async () => {
  logger.info(`WhatsApp service started on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
  });

  try {
    // Check for missing auth folders from local backups
    logger.info('Checking for missing auth folders from local backups before initializing connections');
    // For now, we'll pass an empty array since we don't have instance data from external services
    // In a real implementation, you might want to get this from your database or configuration
    const localResults = await localAuthFolderManager.checkAndRestoreMissingAuthFolders([]);
    logger.info('Completed checking auth folders from local backups', localResults);

    // Then initialize any WhatsApp connections from the downloaded states
    const authDir = path.join(__dirname, 'auth_info');
    if (fs.existsSync(authDir)) {
      // First, get all tenant folders
      const tenantFolders = fs
        .readdirSync(authDir)
        .filter((folder) => folder.startsWith('tenant_'));

      let totalInstances = 0;
      let restoredInstances = 0;

      // Process tenant folders
      tenantFolders.forEach((tenantFolder) => {
        const tenantId = tenantFolder.replace('tenant_', '');
        const tenantPath = path.join(authDir, tenantFolder);

        // Get instance folders within each tenant folder
        const instanceFolders = fs
          .readdirSync(tenantPath)
          .filter((folder) => folder.startsWith('auth_info_baileys_'));

        totalInstances += instanceFolders.length;

        // Restore connections for each instance
        instanceFolders.forEach((instanceFolder) => {
          const instanceId = instanceFolder.replace('auth_info_baileys_', '');
          try {
            logger.info(`Restoring connection for instance ${instanceId} (Tenant: ${tenantId})`);
            whatsappManager.connectToWhatsApp(instanceId, tenantId);
            restoredInstances++;
          } catch (error) {
            logger.error(`Failed to restore connection for instance ${instanceId}`, {
              error: error.stack,
              tenantId,
            });
          }
        });
      });

      // Also check for any instances in the root auth_info directory (legacy or non-tenant instances)
      const rootInstanceFolders = fs
        .readdirSync(authDir)
        .filter((folder) => folder.startsWith('auth_info_baileys_'));

      totalInstances += rootInstanceFolders.length;

      rootInstanceFolders.forEach((folder) => {
        const instanceId = folder.replace('auth_info_baileys_', '');
        try {
          logger.info(`Restoring connection for non-tenant instance ${instanceId}`);
          whatsappManager.connectToWhatsApp(instanceId);
          restoredInstances++;
        } catch (error) {
          logger.error(`Failed to restore connection for non-tenant instance ${instanceId}`, {
            error: error.stack,
          });
        }
      });

      logger.info(
        `Found ${totalInstances} existing auth folders (${restoredInstances} restored successfully)`
      );
    }
  } catch (error) {
    logger.error('Error initializing existing connections', { error: error.stack });
  }

  // Set up periodic check for missing auth folders (every 10 minutes)
  const AUTH_FOLDER_CHECK_INTERVAL = 10 * 60 * 1000;
  setInterval(async () => {
    try {
      logger.info('Starting scheduled check for missing auth folders from local backups');
      // For now, we'll pass an empty array since we don't have instance data from external services
      // In a real implementation, you might want to get this from your database or configuration
      const results = await localAuthFolderManager.checkAndRestoreMissingAuthFolders([]);
      logger.info('Completed scheduled check for missing auth folders from local backups', results);
    } catch (error) {
      logger.error('Error in scheduled auth folder check', { error: error.stack });
    }
  }, AUTH_FOLDER_CHECK_INTERVAL);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Export for testing
// module.exports = app;
