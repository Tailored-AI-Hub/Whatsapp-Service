require('dotenv').config();
const fs = require('fs');
const path = require('path');
// const { URLSearchParams } = require('url'); // EXTERNAL SERVICE - Not needed when DB calls are commented out
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  decryptPollVote,
} = require('@whiskeysockets/baileys');
const { createHash } = require('crypto');
const logger = require('../utils/logger');
// const { sendToQueue } = require('./sqsService'); // EXTERNAL SERVICE - SQS
const localAuthFolderManager = require('./localAuthFolderManager'); // Local auth folder management
// const { getToken } = require('./tokenManager'); // EXTERNAL SERVICE - Token Management
const connections = new Map();
// Simple message store to track messages for poll decryption
const messageStore = new Map();
let CONNECTION_RETRIES = 10;

/**
 * Store a message for later retrieval (needed for poll decryption)
 * @param {Object} message - Message to store
 */
const storeMessage = async (message, _instanceId, _originalDemandMessageId, _optionsProvided) => {
  try {
    // Only store poll creation messages
    if (!message.message?.pollCreationMessage && !message.message?.pollCreationMessageV3) {
      return;
    }

    // Store in Map using production format (underscore separator)
    const mapKey = `${message.key.remoteJid}_${message.key.id}`;
    messageStore.set(mapKey, message);
    // Keep only last 500 messages to prevent memory leaks
    if (messageStore.size > 500) {
      const firstKey = messageStore.keys().next().value;
      messageStore.delete(firstKey);
    }
    console.log('Poll message stored in Map successfully');

    // EXTERNAL SERVICE - Database storage commented out
    // const token = await getToken();
    // if (!token) return;

    // const payload = {
    //   instance_id: instanceId,
    //   group_id: message.key.remoteJid,
    //   message_id: message.key.id,
    //   message_data: message,
    //   original_demand_message_id: originalDemandMessageId,
    //   options_provided: optionsProvided,
    // };
    // const response = await fetch(`http://${process.env.STORAGE_API_URL}/sqldb/store-poll-message`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     Authorization: `Bearer ${token}`,
    //   },
    //   body: JSON.stringify(payload),
    // });

    // if (response.ok) {
    //   console.log('Poll message stored in DB successfully');
    // }
  } catch (error) {
    logger.error('Error storing poll message:', error.message);
  }
};

/**
 * Retrieve a message from store (needed for poll decryption)
 * @param {Object} key - Message key
 * @returns {Object|null} Stored message or null
 */
const getMessage = async (key) => {
  try {
    console.log('getMessage called with key:', {
      id: key?.id,
      remoteJid: key?.remoteJid,
    });

    if (!key?.id || !key?.remoteJid) {
      console.log('Invalid key provided to getMessage');
      return null;
    }

    // First, try to get from Map (the working method)
    let mapMessageData = null;
    try {
      const mapKey = `${key.remoteJid}_${key.id}`;
      console.log('Attempting to retrieve from Map with key:', mapKey);
      const mapResult = messageStore.get(mapKey);
      if (mapResult) {
        mapMessageData = mapResult;
        console.log('Poll message retrieved from Map successfully');
      } else {
        console.log('No data found in Map for key:', mapKey);
      }
    } catch (mapError) {
      console.log('Error retrieving from Map:', mapError.message);
    }

    // EXTERNAL SERVICE - Database retrieval commented out
    // let dbMessageData = null;
    // try {
    //   console.log('Attempting to get token for DB retrieval');
    //   const token = await getToken();
    //   if (token) {
    //     console.log('Token obtained, making DB request');
    //     const queryParams = new URLSearchParams({
    //       group_id: key.remoteJid,
    //       message_id: key.id,
    //     });

    //     const response = await fetch(
    //       `http://${process.env.STORAGE_API_URL}/sqldb/store-poll-message?${queryParams}`,
    //       {
    //         method: 'GET',
    //         headers: {
    //           'Content-Type': 'application/json',
    //           Authorization: `Bearer ${token}`,
    //         },
    //       }
    //     );

    //     console.log('DB response status:', response.status);
    //     if (response.ok) {
    //       const result = await response.json();
    //       console.log('DB response result:', { success: result.success });
    //       if (result.success) {
    //         // Check if message_data is a string and parse it, otherwise return as-is
    //         let messageData = result.message_data;
    //         if (typeof messageData === 'string') {
    //           try {
    //             messageData = JSON.parse(messageData);
    //             console.log('Parsed DB message_data from JSON string');
    //           } catch (parseError) {
    //             console.log('Error parsing message_data JSON:', parseError.message);
    //           }
    //         }
    //         // Fix the messageSecret type issue - convert string back to Buffer
    //         if (
    //           messageData?.message?.messageContextInfo?.messageSecret &&
    //           typeof messageData.message.messageContextInfo.messageSecret === 'string'
    //         ) {
    //           messageData.message.messageContextInfo.messageSecret = Buffer.from(
    //             messageData.message.messageContextInfo.messageSecret,
    //             'base64'
    //           );
    //           console.log('Converted DB messageSecret from string to Buffer');
    //         }

    //         dbMessageData = messageData;
    //         console.log('Poll message retrieved from DB successfully');
    //       } else {
    //         console.log('DB response indicated failure');
    //       }
    //     } else {
    //       console.log('DB response not ok, status:', response.status);
    //     }
    //   } else {
    //     console.log('No token available for DB request');
    //   }
    // } catch (dbError) {
    //   console.log('Error retrieving from DB:', dbError.message);
    // }

    // Compare the two data sources and log differences
    // if (mapMessageData && dbMessageData) {
    //   const mapSecret = mapMessageData.message?.messageContextInfo?.messageSecret;
    //   const dbSecret = dbMessageData.message?.messageContextInfo?.messageSecret;

    //   // Helper function to get string representation for comparison
    //   const getSecretString = (secret) => {
    //     if (!secret) return null;
    //     if (typeof secret === 'string') return secret;
    //     if (Buffer.isBuffer(secret)) return secret.toString('base64');
    //     return String(secret);
    //   };

    //   const mapSecretStr = getSecretString(mapSecret);
    //   const dbSecretStr = getSecretString(dbSecret);

    //   console.log('Comparing Map vs DB data:', {
    //     bothExist: true,
    //     mapHasMessageSecret: !!mapSecret,
    //     dbHasMessageSecret: !!dbSecret,
    //     mapSecretType: typeof mapSecret,
    //     dbSecretType: typeof dbSecret,
    //     mapSecretIsBuffer: Buffer.isBuffer(mapSecret),
    //     dbSecretIsBuffer: Buffer.isBuffer(dbSecret),
    //     mapSecretSample: mapSecretStr ? mapSecretStr.substring(0, 20) : null,
    //     dbSecretSample: dbSecretStr ? dbSecretStr.substring(0, 20) : null,
    //     secretsMatch: mapSecretStr === dbSecretStr,
    //   });

    //   // Try DB data first (since that's what we want to transition to)
    //   console.log('Using db data for decryption');
    //   return dbMessageData;
    // } else if (mapMessageData) {
    //   console.log('Only Map data available, using it');
    //   return mapMessageData;
    // } else if (dbMessageData) {
    //   console.log('Only DB data available, using it');
    //   return dbMessageData;
    // }

    // Simplified return - only use Map data since DB is commented out
    if (mapMessageData) {
      console.log('Using Map data for decryption');
      return mapMessageData;
    }

    console.log('No data found in Map');
    return null;
  } catch (error) {
    console.log('Error in getMessage function:', error.message);
    console.log('Error stack:', error.stack);
    return null;
  }
};

/**
 * Handle poll update messages (votes)
 * @param {Object} message - Poll update message
 * @param {string} instanceId - Instance ID
 */
const handlePollUpdate = async (message, instanceId) => {
  try {
    const connection = connections.get(instanceId);
    if (!connection || !connection.sock) {
      logger.warn('No connection found for poll update', { instanceId });
      return;
    }

    const pollUpdate = message.message.pollUpdateMessage;
    const voter = message.key.participant || message.key.remoteJid;
    const voterNumber = voter.split('@')[0];
    const sessionId = connection.phoneNumber;

    logger.info('Processing poll vote', {
      voter: voterNumber,
      pollCreationKey: pollUpdate.pollCreationMessageKey,
      instanceId,
    });

    // Get the original poll message
    const pollMsgId = pollUpdate.pollCreationMessageKey?.id;
    const originalPollMessage = await getMessage(pollUpdate.pollCreationMessageKey);

    // console.log('Poll Vote Details:', {
    //   voter: voterNumber,
    //   voterName: message.pushName,
    //   groupId: message.key.remoteJid,
    //   pollCreationKey: pollUpdate.pollCreationMessageKey,
    //   voteTimestamp: new Date(message.messageTimestamp * 1000),
    // });

    if (originalPollMessage && pollMsgId) {
      try {
        // Get complete poll information
        const pollCreationMsg =
          originalPollMessage.message.pollCreationMessageV3 ||
          originalPollMessage.message.pollCreationMessage;

        if (pollCreationMsg) {
          // Extract poll details
          const pollInfo = {
            question: pollCreationMsg.name,
            options: pollCreationMsg.options?.map((opt) => opt.optionName) || [],
            selectableCount: pollCreationMsg.selectableOptionsCount || 1,
            contextInfo: pollCreationMsg.contextInfo,
          };

          // console.log('Complete Poll Information:', pollInfo);

          // Try to decrypt the vote using the improved method
          try {
            // Use simple JID format like production (not the participant JID with suffix)
            const pollCreatorJid = sessionId + '@s.whatsapp.net';

            console.log('Decryption attempt with parameters:', {
              pollCreatorJid,
              pollMsgId,
              voterJid: voter,
              hasEncKey: !!originalPollMessage.message.messageContextInfo?.messageSecret,
              encKeyType: typeof originalPollMessage.message.messageContextInfo?.messageSecret,
            });

            const decrypted = await decryptPollVote(pollUpdate.vote, {
              pollCreatorJid,
              pollMsgId: pollMsgId,
              pollEncKey: originalPollMessage.message.messageContextInfo?.messageSecret,
              voterJid: voter,
            });

            const selectedOptions = [];
            for (const decryptedHash of decrypted.selectedOptions) {
              const hashHex = Buffer.from(decryptedHash).toString('hex').toUpperCase();
              for (const option of pollCreationMsg.options || []) {
                const hash = createHash('sha256')
                  .update(Buffer.from(option.optionName))
                  .digest('hex')
                  .toUpperCase();
                if (hashHex === hash) {
                  selectedOptions.push(option.optionName);
                  break;
                }
              }
            }

            // console.log('Successfully Decrypted Poll Vote:', {
            //   pollQuestion: pollInfo.question,
            //   allPollOptions: pollInfo.options,
            //   selectedOptions: selectedOptions,
            //   voter: voterNumber,
            //   voterName: message.pushName,
            //   voteTimestamp: new Date(message.messageTimestamp * 1000),
            // });

            // EXTERNAL SERVICE - SQS queue sending commented out
            // await sendToQueue(
            //   {
            //     type: 'poll_vote',
            //     pollQuestion: pollInfo.question,
            //     selectedOptions: selectedOptions,
            //     pollMessageId: pollMsgId,
            //     voter: voterNumber,
            //     voterName: message.pushName,
            //     groupId: message.key.remoteJid,
            //     voteTimestamp: message.messageTimestamp,
            //     originalDemandMsg: pollCreationMsg.contextInfo,
            //   },
            //   instanceId,
            //   connection.phoneNumber,
            //   connection.tenantID
            // );

            // Log the decrypted vote data instead of sending to queue
            logger.info('Decrypted poll vote:', {
              pollQuestion: pollInfo.question,
              selectedOptions: selectedOptions,
              voter: voterNumber,
              voterName: message.pushName,
              groupId: message.key.remoteJid,
              voteTimestamp: message.messageTimestamp,
            });
          } catch (decryptError) {
            logger.error('Failed to decrypt poll vote', {
              error: decryptError.message,
              voter: voterNumber,
              pollMsgId,
            });

            // Fallback: show basic poll info even if decryption fails
            logger.info('Could not decrypt vote, but received vote from:', voterNumber);
            logger.info('Poll Basic Info:', {
              question: pollCreationMsg.name,
              options: pollCreationMsg.options?.map((opt) => opt.optionName) || [],
              voter: voterNumber,
              voterName: message.pushName,
            });
          }
        }
      } catch (error) {
        logger.error('Error processing poll message', {
          error: error.stack,
          voter: voterNumber,
        });
      }
    } else {
      logger.info('Original poll message not found in store. Vote received from:', voterNumber);
      logger.info('Poll Creation Key:', pollUpdate.pollCreationMessageKey);
    }
  } catch (error) {
    logger.error('Error processing poll update', {
      error: error.stack,
      instanceId,
      messageId: message.key.id,
    });
  }
};

/**
 * Alternative poll vote handler using messages.update event
 * This is the recommended way to handle poll votes according to Baileys documentation
 */
// const setupPollVoteHandler = (sock, instanceId) => {
//   sock.ev.on('messages.update', async (updates) => {
//     const connection = connections.get(instanceId);
//     if (!connection) return;

//     for (const { key, update } of updates) {
//       if (update.pollUpdates) {
//         try {
//           const pollCreation = getMessage(key);
//           if (pollCreation) {
//             const sessionId = connection.phoneNumber;

//             for (const pollUpdate of update.pollUpdates) {
//               try {
//                 const pollCreationMsg =
//                   pollCreation.message.pollCreationMessageV3 ||
//                   pollCreation.message.pollCreationMessage;

//                 if (pollCreationMsg) {
//                   const decrypted = await decryptPollVote(pollUpdate.vote, {
//                     pollCreatorJid: sessionId + '@s.whatsapp.net',
//                     pollMsgId: key.id,
//                     pollEncKey: pollCreation.message.messageContextInfo?.messageSecret,
//                     voterJid: pollUpdate.voterJid,
//                   });

//                   const selectedOptions = [];
//                   for (const decryptedHash of decrypted.selectedOptions) {
//                     const hashHex = Buffer.from(decryptedHash).toString('hex').toUpperCase();
//                     for (const option of pollCreationMsg.options || []) {
//                       const hash = createHash('sha256')
//                         .update(Buffer.from(option.optionName))
//                         .digest('hex')
//                         .toUpperCase();
//                       if (hashHex === hash) {
//                         selectedOptions.push(option.optionName);
//                         break;
//                       }
//                     }
//                   }

//                   console.log('Poll Update via messages.update:', {
//                     pollQuestion: pollCreationMsg.name,
//                     selectedOptions: selectedOptions,
//                     voter: pollUpdate.voterJid?.split('@')[0],
//                     instanceId,
//                   });
//                 }
//               } catch (decryptError) {
//                 logger.error('Error decrypting poll update', {
//                   error: decryptError.message,
//                   instanceId,
//                 });
//               }
//             }
//           }
//         } catch (error) {
//           logger.error('Error in messages.update poll handler', { error: error.stack });
//         }
//       }
//     }
//   });
// };

/**
 * Initialize a WhatsApp connection
 * @param {string} instanceId - Unique ID for this connection
 * @param {string} tenantId - Tenant ID for this connection
 * @returns {Promise<string>} instanceId when connection is initialized
 */
const initializeConnection = async (instanceId, tenantId) => {
  // Create a promise that resolves when the connection is initialized
  const connectionPromise = new Promise((resolve, reject) => {
    // Set a timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      reject(new Error('Connection initialization timed out'));
    }, 60000); // 60 seconds timeout

    // Set up a temporary event listener to detect when connection is ready
    const checkConnection = () => {
      if (connections.has(instanceId)) {
        const connection = connections.get(instanceId);
        // Connection is ready when we have either a QR code or an open connection
        if (connection.qr || connection.state === 'open') {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(instanceId);
        }
      }
    };

    // Check connection status every 500ms
    const checkInterval = setInterval(checkConnection, 500);
  });

  // Start the connection process
  await connectToWhatsApp(instanceId, tenantId);
  // Wait for the connection to be initialized
  return connectionPromise;
};

/**
 * Initialize a WhatsApp connection
 * @param {string} instanceId - Unique ID for this connection
 * @returns {Object} WhatsApp socket instance
 */
const connectToWhatsApp = async (instanceId, tenantID = null) => {
  // If there's an existing connection, clean it up properly first
  if (connections.has(instanceId)) {
    const existingConn = connections.get(instanceId);
    if (existingConn.sock) {
      try {
        // Remove all existing listeners
        existingConn.sock.ev.removeAllListeners();
        // End the connection
        existingConn.sock.end();
        logger.info('Cleaned up existing socket connection', { instanceId });
      } catch (err) {
        logger.warn('Error cleaning up existing socket:', { error: err.message });
      }
    }
  }

  // Create base auth directory if it doesn't exist
  if (!fs.existsSync('./auth_info')) {
    fs.mkdirSync('./auth_info', { recursive: true });
  }

  // Create tenant directory if tenantID is provided
  let AUTH_FOLDER;
  if (tenantID) {
    const tenantFolder = `./auth_info/tenant_${tenantID}`;
    if (!fs.existsSync(tenantFolder)) {
      fs.mkdirSync(tenantFolder, { recursive: true });
    }
    AUTH_FOLDER = `${tenantFolder}/auth_info_baileys_${instanceId}`;
  } else {
    // Fallback for cases without tenantID (though this should be rare)
    AUTH_FOLDER = `./auth_info/auth_info_baileys_${instanceId}`;
  }

  // Create instance-specific folder
  if (!fs.existsSync(AUTH_FOLDER)) {
    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  // Check environment variable to determine whether to print to terminal
  const printToTerminal = process.env.PRINT_BAILEYS_LOGS === 'true';

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: printToTerminal,
    qrTimeout: 40000,
    markOnlineOnConnect: true,
    retryRequestDelayMs: 1000,
    keepAliveIntervalMs: 25_000,
    maxRetries: 15,
    emitOwnEvents: true,
    connectTimeoutMs: 120_000,
    defaultQueryTimeoutMs: 90_000,
  });

  // Update or create the connection entry
  connections.set(instanceId, {
    sock,
    state: 'connecting',
    qr: null,
    qrTimeout: null,
    phoneNumber: null,
    authFolder: AUTH_FOLDER,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    errorCount: 0,
    tenantID: null,
    retryCount: connections.has(instanceId)
      ? connections.get(instanceId).retryCount
      : CONNECTION_RETRIES,
    // recentConversations: new Set(),
  });
  if (tenantID) {
    connections.get(instanceId).tenantID = tenantID;
  }

  sock.ev.on('creds.update', async (_update) => {
    await saveCreds();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    logger.info(`Connection update for ${instanceId}:`, { update: JSON.stringify(update) });

    // Update last activity timestamp
    if (connections.has(instanceId)) {
      connections.get(instanceId).lastActivity = Date.now();
    }

    // Handle QR code
    if (qr) {
      if (connections.has(instanceId) && connections.get(instanceId).tenantID) {
        try {
          logger.info(`New QR code generated for ${instanceId}`);
          const qrCode = await QRCode.toDataURL(qr);
          if (connections.has(instanceId)) {
            connections.get(instanceId).qr = qrCode;
            connections.get(instanceId).state = 'qr';

            // Set a timeout to delete the connection if not connected within 5 minutes
            const qrTimeout = setTimeout(
              () => {
                // Check if the connection still exists and is still in QR state
                if (connections.has(instanceId) && connections.get(instanceId).state === 'qr') {
                  logger.info(
                    `QR code timeout for ${instanceId}. Connection not established within 3 minutes.`
                  );

                  // First, properly close the socket connection
                  try {
                    if (connections.get(instanceId).sock) {
                      // Remove all event listeners to prevent further callbacks
                      connections.get(instanceId).sock.ev.removeAllListeners();
                      // End the connection
                      connections.get(instanceId).sock.end();
                      logger.info('Socket connection ended', { instanceId });
                    }
                  } catch (err) {
                    logger.warn('Error closing connection', { error: err.message, instanceId });
                  }

                  // Then delete the auth folder
                  if (fs.existsSync(AUTH_FOLDER)) {
                    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                    logger.info('Auth folder deleted', { folder: AUTH_FOLDER });
                  }

                  // Finally remove from connections map
                  connections.delete(instanceId);
                }
              },
              3 * 60 * 1000
            ); // QR code will only be valid for 3 minutes

            // Store the timeout ID so we can clear it if connection is established
            connections.get(instanceId).qrTimeout = qrTimeout;
          }
        } catch (err) {
          logger.error('QR Code generation error:', { error: err.stack });
          if (connections.has(instanceId)) {
            connections.get(instanceId).errorCount++;
          }
        }
      } else {
        if (fs.existsSync(AUTH_FOLDER)) {
          fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
          logger.info('Auth folder deleted', { folder: AUTH_FOLDER });
          connections.delete(instanceId);
        }
      }
    }

    if (connection) {
      if (connections.has(instanceId)) {
        connections.get(instanceId).state = connection;
      }
      logger.info(`Connection state for ${instanceId}:`, { connection });

      if (connection === 'close') {
        let manualLogout = false;
        if (connections.has(instanceId)) {
          connections.get(instanceId).qr = null;
        } else {
          manualLogout = true;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.info(`Connection closed for instance ${instanceId}. Status code: ${statusCode}`);

        if (shouldReconnect && !manualLogout) {
          if (connections.get(instanceId) && connections.get(instanceId).retryCount > 0) {
            logger.info(
              `Attempting to reconnect... for instance ${instanceId} with ${connections.get(instanceId).retryCount} retries left`
            );
            setTimeout(() => {
              try {
                connections.get(instanceId).retryCount--;
                connectToWhatsApp(instanceId, connections.get(instanceId).tenantID);
              } catch (error) {
                logger.error('Error reconnecting:', { error: error.stack });
              }
            }, 15000);
          } else {
            logger.warn(
              `Maximum consecutive reconnection attempts reached for instance ${instanceId}. Giving up.`
            );
            // EXTERNAL SERVICE - Token Management commented out
            // const token = await getToken();
            // if (token) {
            //   try {
            //     const res = await fetch(
            //       `http://${process.env.STORAGE_API_URL}/sqldb/instances/${connections.get(instanceId).tenantID}/tenant-instances`,
            //       {
            //         headers: {
            //           Authorization: `Bearer ${token}`,
            //         },
            //       }
            //     );
            //     if (res.ok) {
            //       const resData = await res.json();
            //       const instanceIdAlreadyExists = resData.filter(
            //         (instance) => instance.instance_id === instanceId
            //       );
            //       if (instanceIdAlreadyExists.length > 0) {
            //         deleteInstance(instanceId);
            //       } else {
            //         try {
            //           if (connections.get(instanceId).sock) {
            //             // Remove all event listeners to prevent further callbacks
            //             connections.get(instanceId).sock.ev.removeAllListeners();
            //             // End the connection
            //             connections.get(instanceId).sock.end();
            //             logger.info('Socket connection ended', { instanceId });
            //           }
            //         } catch (err) {
            //           logger.warn('Error closing connection', { error: err.message, instanceId });
            //         }
            //         if (fs.existsSync(AUTH_FOLDER)) {
            //           fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            //           logger.info('Auth folder deleted', { folder: AUTH_FOLDER });
            //         }
            //         connections.delete(instanceId);
            //       }
            //     } else {
            //       logger.warn('Could not get tenant instances', {
            //         status: res.status,
            //         instanceId,
            //       });
            //     }
            //   } catch (error) {
            //     logger.error('Error in API operations:', { error: error.stack });
            //   }
            // } else {
            //   logger.warn('Could not get token for API call', { instanceId });
            // }
          }
        } else {
          if (connections.get(instanceId)) {
            logger.info('User logged out, clearing auth state...');
            const result = deleteInstance(instanceId);
            if (!result) {
              logger.error('Error deleting instance:', { instanceId });
            }
          } else {
            logger.info('Instance not found, already logged out...');
          }
        }
      } else if (connection === 'open') {
        logger.info(`Connection opened for ${instanceId}`);
        if (connections.has(instanceId)) {
          // Clear the QR timeout if it exists
          if (connections.get(instanceId).qrTimeout) {
            clearTimeout(connections.get(instanceId).qrTimeout);
            connections.get(instanceId).qrTimeout = null;
          }

          connections.get(instanceId).qr = null;
          // Reset the connection retries counter when connection is successful
          connections.get(instanceId).retryCount = CONNECTION_RETRIES;
        }

        try {
          const phoneNumber = sock.user.id.split(':')[0];
          if (connections.has(instanceId)) {
            connections.get(instanceId).phoneNumber = phoneNumber;
          }
        } catch (error) {
          logger.error('Error getting phone number:', { error: error.stack });
          if (connections.has(instanceId)) {
            connections.get(instanceId).errorCount++;
          }
        }

        // Local auth folder backup after successful connection
        if (connections.has(instanceId) && connections.get(instanceId).tenantID) {
          // Schedule local backup with delay to ensure all credentials are established
          setTimeout(async () => {
            try {
              if (connections.has(instanceId)) {
                await localAuthFolderManager.backupInstanceAuthFolder(
                  instanceId,
                  connections.get(instanceId).tenantID
                );
                logger.info(`Auth folder for instance ${instanceId} backed up locally after delay`);
                
                // Clean up old backups (keep only the latest 5)
                await localAuthFolderManager.cleanupInstanceBackups(instanceId, 5);
              } else {
                logger.warn(`Skipping local backup for instance ${instanceId} as connection no longer exists`);
              }
            } catch (backupError) {
              logger.error(`Failed to backup auth folder for instance ${instanceId} locally`, {
                error: backupError.stack,
                instanceId,
              });
            }
          }, 30 * 1000); // 30 seconds delay
        }
        // EXTERNAL SERVICE - Database operations commented out
        // This is for the first time connection, so we need to map the tenantId to the instanceId
        // if (connections.get(instanceId)?.tenantID) {
        //   const phoneNumber = connections.get(instanceId).phoneNumber;
        //   try {
        //     // EXTERNAL SERVICE - Token Management commented out
        //     // const token = await getToken();
        //     // if (token) {
        //     //   try {
        //     //     const res = await fetch(
        //     //       `http://${process.env.STORAGE_API_URL}/sqldb/instances/${connections.get(instanceId).tenantID}/tenant-instances`,
        //     //       {
        //     //         headers: {
        //     //           Authorization: `Bearer ${token}`,
        //     //         },
        //     //       }
        //     //     );

        //     //     if (res.ok) {
        //     //       const resData = await res.json();
        //     //       const InstanceIdAlreadyExists = resData.filter(
        //     //         (instance) => instance.instance_id === instanceId
        //     //       );
        //     //       if (InstanceIdAlreadyExists.length > 0) {
        //     //         logger.info('Instance already exists in the database');
        //     //         return;
        //     //       }
        //     //       // Check if there's already an active connection with the same phone number
        //     //       logger.info('Checking existing instances for phone number', { phoneNumber });

        //     //       const existingInstances = resData.filter(
        //     //         (instance) =>
        //     //           instance.phone_number === phoneNumber && instance.disconnected_at === null
        //     //       );

        //     //       if (existingInstances.length > 0) {
        //     //         logger.warn('Active connection already exists for this phone number', {
        //     //           phoneNumber,
        //     //           existingInstanceId: existingInstances[0].instance_id,
        //     //         });

        //     //         // First, properly close the socket connection
        //     //         try {
        //     //           if (connections.has(instanceId) && connections.get(instanceId).sock) {
        //     //             // Remove all event listeners to prevent further callbacks
        //     //             connections.get(instanceId).sock.ev.removeAllListeners();
        //     //             // End the connection
        //     //             connections.get(instanceId).sock.end();
        //     //             logger.info('Socket connection ended', { instanceId });
        //     //           }
        //     //         } catch (err) {
        //     //           logger.warn('Error closing connection', {
        //     //             error: err.message,
        //     //             instanceId,
        //     //           });
        //     //         }

        //     //         // Then delete the auth folder
        //     //         if (fs.existsSync(AUTH_FOLDER)) {
        //     //           fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        //     //           logger.info('Auth folder deleted', { folder: AUTH_FOLDER });
        //     //         }

        //     //         // Finally remove from connections map
        //     //         connections.delete(instanceId);
        //     //         return;
        //     //       }

        //     //       if (res.status === 200) {
        //     //         const data = {
        //     //           tenant: connections.get(instanceId).tenantID,
        //     //           phone_number: phoneNumber,
        //     //           instance_id: instanceId,
        //     //         };

        //     //         const createOptions = {
        //     //           method: 'POST',
        //     //           headers: {
        //     //           'Content-Type': 'application/json',
        //     //           Authorization: `Bearer ${token}`,
        //     //         },
        //     //         body: JSON.stringify(data),
        //     //       };

        //     //       const createResponse = await fetch(
        //     //         `http://${process.env.STORAGE_API_URL}/sqldb/instances`,
        //     //         createOptions
        //     //       );
        //     //       if (!createResponse.ok) {
        //     //         throw new Error(`HTTP error! Status: ${createResponse.status}`);
        //     //       }
        //     //       const createData = await createResponse.json();
        //     //       logger.info('Instance creation response:', createData);

        //     //       // Add a delay before backing up the auth folder
        //     //       // This gives time for all credentials to be properly established
        //     //       logger.info(
        //     //         `Scheduling auth folder backup for instance ${instanceId} in 30 seconds`
        //     //       );
        //     //       setTimeout(
        //     //         async () => {
        //     //           try {
        //     //             // Check if the connection still exists before backing up
        //     //             if (connections.has(instanceId)) {
        //     //               await authFolderManager.uploadInstanceAuthFolderToS3(
        //     //                 instanceId,
        //     //               connections.get(instanceId).tenantID
        //     //               );
        //     //               logger.info(
        //     //                 `Auth folder for instance ${instanceId} backed up to S3 after delay`
        //     //               );
        //     //             } else {
        //     //               logger.warn(
        //     //                 `Skipping delayed backup for instance ${instanceId} as connection no longer exists`
        //     //               );
        //     //             }
        //     //           } catch (backupError) {
        //     //             logger.error(
        //     //               `Failed to backup auth folder for instance ${instanceId} after delay`,
        //     //               {
        //     //                 error: backupError.stack,
        //     //                 instanceId,
        //     //               }
        //     //             );
        //     //           }
        //     //         },
        //     //         1 * 60 * 1000
        //     //       ); // 1 minute delay
        //     //     } else {
        //     //       logger.info('Instance already exists in the database');
        //     //       deleteInstance(instanceId);
        //     //     }
        //     //   } catch (fetchError) {
        //     //     logger.error('Error fetching tenant instances:', {
        //     //       error: fetchError.message,
        //     //       instanceId,
        //     //     });
        //     //   }
        //     // } else {
        //     //   logger.warn('Could not get token for API call', { instanceId });
        //     // }
        //   } catch (error) {
        //     logger.error('Error in API operations:', { error: error.stack });
        //     // Add a delay before potentially deleting the instance
        //     logger.info('Adding delay before handling error', { instanceId });
        //     await new Promise((resolve) => setTimeout(resolve, 60 * 1000)); // 60 seconds delay
        //     connectToWhatsApp(instanceId, connections.get(instanceId).tenantID);
        //     logger.info('Resuming after delay', { instanceId });
        //     // deleteInstance(instanceId);
        //     if (connections.has(instanceId)) {
        //       connections.get(instanceId).errorCount++;
        //     }
        //   }
        // }
      }
    }
  });

  // Handle all incoming messages, edits, and reactions
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      // Skip messages sent by the bot itself
      if (message.key.fromMe) continue;
      console.log(message);

      const messageId = message.key.id;

      if (message.message?.pollUpdateMessage) {
        try {
          logger.info('Poll update received', {
            messageId,
            voter: message.key.participant || message.key.remoteJid,
            pollCreationKey: message.message.pollUpdateMessage.pollCreationMessageKey,
          });

          // Handle poll update separately
          await handlePollUpdate(message, instanceId);
          continue;
        } catch (error) {
          logger.error('Error handling poll update', { error: error.stack, messageId });
          continue;
        }
      }
      const hasMessageContent =
        message.message &&
        (message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          message.message.imageMessage ||
          message.message.videoMessage ||
          message.message.audioMessage ||
          message.message.documentMessage ||
          message.message.stickerMessage ||
          message.message.reactionMessage);

      if (!hasMessageContent) {
        logger.info('Message has no content, skipping', { messageId });
        continue;
      }
      //get the tenantId and token
      // EXTERNAL SERVICE - Token Management commented out
      // const token = await getToken();
      // if (!token) {
      //   logger.warn('Could not get token for blacklist check', { instanceId });
      //   continue;
      // }
      // const tenantId = connections.get(instanceId).tenantID;
      // Get the sender's phone number (EXTERNAL SERVICE - Not used when filtering is commented out)
      // const senderNumber = message.key.participant || message.key.remoteJid;
      // const cleanSenderNumber = senderNumber.split('@')[0]; // EXTERNAL SERVICE - Not used when blacklist is commented out
      // console.log(connections.get(instanceId).phoneNumber);
      // Get the whitelisted groups
      // EXTERNAL SERVICE - Whitelisted Groups commented out
      // const whitelistedGroups = await getWhitelistedGroups(tenantId, token, {
      //   phoneNumber: connections.get(instanceId).phoneNumber,
      // });
      // console.log(whitelistedGroups);
      // if (!whitelistedGroups) {
      //   logger.warn('Could not get whitelisted groups', { instanceId });
      //   continue;
      // }
      // Check if the message is in any of the whitelisted groups
      // const isWhitelistedGroup = whitelistedGroups.some((group) => {
      //   return group.whitelisted_id === message.key.remoteJid;
      // });
      // if (!isWhitelistedGroup) {
      //   logger.info('Message not in whitelisted groups');
      //   continue;
      // }

      // Fetch and check blacklisted numbers
      // EXTERNAL SERVICE - Blacklisted Numbers commented out
      // const blacklistedData = await getBlacklistedNumbers(tenantId, token);
      // if (!blacklistedData) {
      //   logger.warn('Could not get blacklisted numbers', { instanceId });
      //   continue;
      // }
      // const isBlacklisted = blacklistedData.some((entry) => {
      //   // Check if number is blacklisted globally or for this specific group
      //   return entry.phone_number === cleanSenderNumber && entry.is_blacklisted;
      // });

      // if (isBlacklisted) {
      //   logger.info('Ignoring message from blacklisted number', {
      //     senderNumber: cleanSenderNumber,
      //     groupId: message.key.remoteJid,
      //   });
      //   continue;
      // }

      logger.info('Target group matched, sending message to SQS');
      // Track message received
      if (connections.has(instanceId)) {
        connections.get(instanceId).lastActivity = Date.now();
      }

      try {
        // Include instance and tenant info in the message
        // Store the incoming message for potential poll decryption later
        // storeMessage(message);
        // Send message to queue
        // EXTERNAL SERVICE - SQS queue sending commented out
        // await sendToQueue(
        //   message,
        //   instanceId,
        //   connections.get(instanceId).phoneNumber,
        //   connections.get(instanceId).tenantID
        // );
        // Also send a poll as a test (you can remove this later)
        // const pollData = {
        //   name: "What's your favorite programming language?",
        //   options: ['JavaScript', 'Python', 'Java', 'Go', 'Rust'],
        //   selectableCount: 1,
        //   toAnnouncementGroup: false,
        // };
        // const result = await sendMessage(
        //   instanceId,
        //   message, // The message object you're replying to (or null if sending to specific number)
        //   pollData,
        //   null, // or specify a phone number/group ID
        //   { messageType: 'poll' }
        // );
        // // Store the sent poll message for later vote decryption
        // if (result.success && result.result) {
        //   storeMessage(result.result);
        // }
      } catch (error) {
        logger.error('Failed to send message to SQS:', { error: error.stack });
        if (connections.has(instanceId)) {
          connections.get(instanceId).errorCount++;
        }
      }
    }
  });

  // sock.ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts }) => {
  //   try {
  //     if (connections.has(instanceId)) {
  //       const connection = connections.get(instanceId);
  //       // Format and store chats for future reference
  //       const formattedChats = newChats.map((chat) => {
  //         const isGroup = chat.id.endsWith('@g.us');
  //         return {
  //           id: chat.id,
  //           name: isGroup ? chat.name || '' : chat.messages[chat.messages.length - 1].pushname,
  //           isGroup,
  //           phoneNumber: !isGroup ? chat.id.split('@')[0] : undefined,
  //           lastMessageTimestamp: chat.conversationTimestamp,
  //         };
  //       });
  //       // Process contacts to potentially find more DMs
  //       if (newContacts && Object.keys(newContacts).length > 0) {
  //         for (const [id, contact] of Object.entries(newContacts)) {
  //           // Only include user contacts (not groups) that aren't already in the chat list
  //           if (!id.endsWith('@g.us') && !formattedChats.some((c) => c.id === id)) {
  //             formattedChats.push({
  //               id,
  //               name: contact.name || contact.notify || contact.verifiedName || id.split('@')[0],
  //               isGroup: false,
  //               phoneNumber: id.split('@')[0],
  //               lastMessageTimestamp: Date.now(), // We don't have this info from contacts
  //             });
  //           }
  //         }
  //       }
  //       // Store in the connection object
  //       // Add each formatted chat to the Set
  //       formattedChats.forEach((chat) => {
  //         connection.recentConversations.add(chat);
  //       });
  //       logger.info(`
  //       Stored ${formattedChats.length} chats for instance ${instanceId}
  //       (${formattedChats.filter((c) => !c.isGroup).length} DMs,
  //       ${formattedChats.filter((c) => c.isGroup).length} groups)`);
  //     }
  //   } catch (error) {
  //     logger.warn('Error processing messaging history', {
  //       error: error.message,
  //       instanceId,
  //     });
  //   }
  // });

  // sock.ev.on('chats.upsert', (newChats) => {
  //   try {
  //     if (connections.has(instanceId)) {
  //       const connection = connections.get(instanceId);
  //       // Format and add any new chats
  //       for (const chat of newChats) {
  //         const isGroup = chat.id.endsWith('@g.us');
  //         const formattedChat = {
  //           id: chat.id,
  //           name: chat.name || '',
  //           isGroup,
  //           phoneNumber: !isGroup ? chat.id.split('@')[0] : undefined,
  //           lastMessageTimestamp: chat.conversationTimestamp || Date.now(),
  //         };
  //         // Check if we already have this chat
  //         if (connection.recentConversations.has(formattedChat)) {
  //           // Update existing chat
  //           connection.recentConversations.delete(formattedChat);
  //           connection.recentConversations.add(formattedChat);
  //         } else {
  //           // Add new chat
  //           connection.recentConversations.add(formattedChat);
  //         }
  //       }
  //       logger.info(
  //         `Updated chats list for instance ${instanceId}, now has ${connection.recentConversations.size} chats`
  //       );
  //     }
  //   } catch (error) {
  //     logger.warn('Error processing chats upsert', {
  //       error: error.message,
  //       instanceId,
  //     });
  //   }
  // });

  return sock;
};

const getAllInstances = () => {
  return Array.from(connections.entries()).map(([instanceId, conn]) => ({
    instanceId,
    state: conn.state,
    qr: conn.qr,
    phoneNumber: conn.phoneNumber,
    lastActivity: conn.lastActivity,
    createdAt: conn.createdAt,
  }));
};

/**
 * Get a specific WhatsApp instance
 * @param {string} instanceId - ID of the instance to retrieve
 * @returns {Object|null} Instance object or null if not found
 */
const getInstance = (instanceId) => {
  const connection = connections.get(instanceId);
  if (!connection) {
    return null;
  }
  return {
    instanceId,
    state: connection.state,
    qr: connection.qr,
    phoneNumber: connection.phoneNumber,
    lastActivity: connection.lastActivity,
    createdAt: connection.createdAt,
  };
};

/**
 * Delete a WhatsApp instance
 * @param {string} instanceId - ID of the instance to delete
 * @returns {boolean} Success status
 */
const deleteInstance = async (instanceId) => {
  const connection = connections.get(instanceId);
  if (!connection) {
    logger.warn('Instance not found for deletion', { instanceId });
    return false;
  }

  try {
    if (connection.sock) {
      try {
        connection.sock.ev.removeAllListeners();
        connection.sock.end();
        logger.info('Socket connection ended', { instanceId });
      } catch (err) {
        logger.warn('Error closing connection', { error: err.message, instanceId });
      }
    }

    // Handle API deactivation
    // EXTERNAL SERVICE - Token Management commented out
    // const token = await getToken();
    // if (token) {
    //   try {
    //     const response = await fetch(
    //       `http://${process.env.STORAGE_API_URL}/sqldb/instances/${instanceId}/deactivate`,
    //       {
    //         method: 'POST',
    //         headers: {
    //           'Content-Type': 'application/json',
    //           Authorization: `Bearer ${token}`,
    //         },
    //       }
    //     );

    //     if (response.ok) {
    //       const data = await response.json();
    //       logger.info('Instance deactivation response:', data);
    //     } else {
    //       logger.warn('Failed to deactivate instance in API', {
    //         instanceId,
    //         status: response.status,
    //       });
    //       return false;
    //     }
    //   } catch (apiError) {
    //     logger.error('API call failed:', {
    //       error: apiError.message,
    //       instanceId,
    //     });
    //     return false;
    //   }
    // } else {
    //   logger.warn('Could not get token for API call', { instanceId });
    //   return false;
    // }

    // Clean up auth folder
    connections.delete(instanceId);
    if (fs.existsSync(connection.authFolder)) {
      fs.rmSync(connection.authFolder, { recursive: true, force: true });
      logger.info('Auth folder deleted', { folder: connection.authFolder });
    }

    return true;
  } catch (error) {
    logger.error('Error in deletion process:', {
      error: error.message,
      stack: error.stack,
      instanceId: instanceId,
    });
    logger.info(`Attempting to reconnect with storage service... after a delay of 15 seconds`);
    setTimeout(() => {
      connectToWhatsApp(instanceId, connections.get(instanceId).tenantID);
    }, 15000);
    return false;
  }
};

/**
 * Send a message via WhatsApp
 * @param {string} instanceId - ID of the instance to use
 * @param {string|Object} message_object - Message object or recipient info
 * @param {string|Object} response_msg - Message content (text, poll object, etc.)
 * @param {string} to - Phone number or group ID to send to by default it is set to null as mostly we will be sending msgs as a reply to a message
 * @param {Object} options - Additional options (messageType, etc.)
 * @returns {Promise<Object>} Message info
 */
const sendMessage = async (instanceId, response_msg, message_object = null, to = null, options = {}) => {
  const connection = connections.get(instanceId);
  let result = null;

  try {
    if (!connection) {
      logger.error('Instance not found when sending message', { instanceId });
      return { success: false, error: 'Instance not found' };
    }

    if (connection.state !== 'open') {
      logger.warn('WhatsApp connection not open', { instanceId, state: connection.state });
      return { success: false, error: 'WhatsApp connection not open' };
    }

    // If sending directly to a number (not replying), verify the number is on WhatsApp
    if (to !== null) {
      const isGroupId = (typeof to === 'string') && (to.endsWith('@g.us') || to.includes('@g.us'));
      if (!isGroupId) {
        const rawNumber = (typeof to === 'string' && to.includes('@')) ? to.split('@')[0] : to;
        try {
          const waResult = await connection.sock.onWhatsApp(rawNumber);
          const exists = Array.isArray(waResult) && waResult.some((entry) => entry && entry.exists);
          if (!exists) {
            return { success: false, error: 'Number does not exist on whatsapp' };
          }
        } catch (checkError) {
          logger.warn('Failed to verify WhatsApp registration for number', {
            to,
            error: checkError.message,
          });
          // If verification fails unexpectedly, proceed to attempt sending
        }
      }
    }

    // Determine the content to send based on message type
    let messageContent;
    const messageType = options.messageType || 'text';

    switch (messageType) {
      case 'poll':
        messageContent = {
          poll: {
            name: response_msg.name || 'Poll',
            values: response_msg.options || [],
            selectableCount: response_msg.selectableCount || 1,
            toAnnouncementGroup: response_msg.toAnnouncementGroup || false,
          },
        };
        break;
      case 'image':
        // Handle image messages
        if (typeof response_msg === 'string') {
          // Check if it's a file path or URL
          if (response_msg.startsWith('http://') || response_msg.startsWith('https://')) {
            // It's a URL - download the file and send the content
            try {
              const https = require('https');
              const http = require('http');
              
              const url = new URL(response_msg);
              const client = url.protocol === 'https:' ? https : http;
              
              const fileBuffer = await new Promise((resolve, reject) => {
                const request = client.get(url, (response) => {
                  if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
                    return;
                  }
                  
                  const chunks = [];
                  response.on('data', (chunk) => chunks.push(chunk));
                  response.on('end', () => resolve(Buffer.concat(chunks)));
                  response.on('error', reject);
                });
                
                request.on('error', reject);
                request.setTimeout(30000, () => {
                  request.destroy();
                  reject(new Error('Download timeout'));
                });
              });
              
              messageContent = {
                image: fileBuffer,
                caption: options.caption || ''
              };
            } catch (error) {
              throw new Error(`Failed to download file from URL: ${response_msg}. Error: ${error.message}`);
            }
          } else {
            // It's a file path - read the file and upload it
            try {
              const fileBuffer = fs.readFileSync(response_msg);
              messageContent = {
                image: fileBuffer,
                caption: options.caption || ''
              };
            } catch (error) {
              throw new Error(`Failed to read file at path: ${response_msg}. Error: ${error.message}`);
            }
          }
        } else if (response_msg.url) {
          // If response_msg is an object with url property
          if (response_msg.url.startsWith('http://') || response_msg.url.startsWith('https://')) {
            // It's a URL - download the file and send the content
            try {
              const https = require('https');
              const http = require('http');
              
              const url = new URL(response_msg.url);
              const client = url.protocol === 'https:' ? https : http;
              
              const fileBuffer = await new Promise((resolve, reject) => {
                const request = client.get(url, (response) => {
                  if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
                    return;
                  }
                  
                  const chunks = [];
                  response.on('data', (chunk) => chunks.push(chunk));
                  response.on('end', () => resolve(Buffer.concat(chunks)));
                  response.on('error', reject);
                });
                
                request.on('error', reject);
                request.setTimeout(30000, () => {
                  request.destroy();
                  reject(new Error('Download timeout'));
                });
              });
              
              messageContent = {
                image: fileBuffer,
                caption: response_msg.caption || options.caption || ''
              };
            } catch (error) {
              throw new Error(`Failed to download file from URL: ${response_msg.url}. Error: ${error.message}`);
            }
          } else {
            // It's a file path - read the file and upload it
            try {
              const fileBuffer = fs.readFileSync(response_msg.url);
              messageContent = {
                image: fileBuffer,
                caption: response_msg.caption || options.caption || ''
              };
            } catch (error) {
              throw new Error(`Failed to read file at path: ${response_msg.url}. Error: ${error.message}`);
            }
          }
        } else if (response_msg.buffer || response_msg.data) {
          // If response_msg contains buffer data
          const fileBuffer = response_msg.buffer || response_msg.data;
          messageContent = {
            image: fileBuffer,
            caption: response_msg.caption || options.caption || ''
          };
        } else {
          throw new Error('Invalid image format. Provide URL, file path, or object with url/buffer property.');
        }
        break;
      case 'document':
      case 'pdf':
        // Handle document/PDF messages
        if (typeof response_msg === 'string') {
          // Check if it's a file path or URL
          if (response_msg.startsWith('http://') || response_msg.startsWith('https://')) {
            // It's a URL - download the file and send the content
            try {
              const https = require('https');
              const http = require('http');
              
              const url = new URL(response_msg);
              const client = url.protocol === 'https:' ? https : http;
              
              const fileBuffer = await new Promise((resolve, reject) => {
                const request = client.get(url, (response) => {
                  if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
                    return;
                  }
                  
                  const chunks = [];
                  response.on('data', (chunk) => chunks.push(chunk));
                  response.on('end', () => resolve(Buffer.concat(chunks)));
                  response.on('error', reject);
                });
                
                request.on('error', reject);
                request.setTimeout(30000, () => {
                  request.destroy();
                  reject(new Error('Download timeout'));
                });
              });
              
              messageContent = {
                document: fileBuffer,
                mimetype: options.mimetype || 'application/pdf',
                fileName: options.fileName || 'document.pdf'
              };
            } catch (error) {
              throw new Error(`Failed to download file from URL: ${response_msg}. Error: ${error.message}`);
            }
          } else {
            // It's a file path - read the file and upload it
            try {
              const fileBuffer = fs.readFileSync(response_msg);
              messageContent = {
                document: fileBuffer,
                mimetype: options.mimetype || 'application/pdf',
                fileName: options.fileName || path.basename(response_msg) || 'document.pdf'
              };
            } catch (error) {
              throw new Error(`Failed to read file at path: ${response_msg}. Error: ${error.message}`);
            }
          }
        } else if (response_msg.url) {
          // If response_msg is an object with url property
          if (response_msg.url.startsWith('http://') || response_msg.url.startsWith('https://')) {
            // It's a URL - download the file and send the content
            try {
              const https = require('https');
              const http = require('http');
              
              const url = new URL(response_msg.url);
              const client = url.protocol === 'https:' ? https : http;
              
              const fileBuffer = await new Promise((resolve, reject) => {
                const request = client.get(url, (response) => {
                  if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
                    return;
                  }
                  
                  const chunks = [];
                  response.on('data', (chunk) => chunks.push(chunk));
                  response.on('end', () => resolve(Buffer.concat(chunks)));
                  response.on('error', reject);
                });
                
                request.on('error', reject);
                request.setTimeout(30000, () => {
                  request.destroy();
                  reject(new Error('Download timeout'));
                });
              });
              
              messageContent = {
                document: fileBuffer,
                mimetype: response_msg.mimetype || options.mimetype || 'application/pdf',
                fileName: response_msg.fileName || options.fileName || 'document.pdf'
              };
            } catch (error) {
              throw new Error(`Failed to download file from URL: ${response_msg.url}. Error: ${error.message}`);
            }
          } else {
            // It's a file path - read the file and upload it
            try {
              const fileBuffer = fs.readFileSync(response_msg.url);
              messageContent = {
                document: fileBuffer,
                mimetype: response_msg.mimetype || options.mimetype || 'application/pdf',
                fileName: response_msg.fileName || options.fileName || path.basename(response_msg.url) || 'document.pdf'
              };
            } catch (error) {
              throw new Error(`Failed to read file at path: ${response_msg.url}. Error: ${error.message}`);
            }
          }
        } else if (response_msg.buffer || response_msg.data) {
          // If response_msg contains buffer data
          const fileBuffer = response_msg.buffer || response_msg.data;
          messageContent = {
            document: fileBuffer,
            mimetype: response_msg.mimetype || options.mimetype || 'application/pdf',
            fileName: response_msg.fileName || options.fileName || 'document.pdf'
          };
        } else {
          throw new Error('Invalid document format. Provide URL, file path, or object with url/buffer property.');
        }
        break;
      case 'text':
      default:
        messageContent = { text: response_msg };
        break;
    }

    if (to !== null) {
      const formattedNumber = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      result = await connection.sock.sendMessage(formattedNumber, messageContent);
      connection.lastActivity = Date.now();
      return { success: true, result };
    }

    if (message_object?.editedMessage) {
      const messageText =
        message_object.message.editedMessage.message?.protocolMessage.editedMessage.conversation ||
        message_object.message.editedMessage.message?.extendedTextMessage?.text;

      result = await connection.sock.sendMessage(message_object.key.remoteJid, messageContent, {
        quoted: {
          key: message_object.message.editedMessage.message.protocolMessage.key,
          message: {
            conversation: messageText,
          },
        },
      });
    } else {
      result = await connection.sock.sendMessage(message_object.key.remoteJid, messageContent);
    }

    connection.lastActivity = Date.now();
    return { success: true, result };
  } catch (error) {
    logger.error('Error sending WhatsApp message', {
      error: error.stack,
      instanceId,
      to,
      messageObject: message_object
        ? JSON.stringify(message_object).substring(0, 100) + '...'
        : null,
    });

    return {
      success: false,
      error: error.message || 'Unknown error occurred while sending message',
    };
  }
};

/**
 * Get all the groups that are whitelisted for a specific tenant
 * @param {string} tenantId - ID of the tenant to fetch whitelisted groups from
 * @param {string} token - Token for the tenant
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.phoneNumber] - Filter by phone number
 * @returns {Array} Array of whitelisted groups
 */
// EXTERNAL SERVICE - Whitelisted groups function commented out
// const getWhitelistedGroups = async (tenantId, token, options = {}) => {
//   try {
//     let url = `http://${process.env.STORAGE_API_URL}/sqldb/${tenantId}/whitelisted-entries`;
//     // Add query parameters if they exist
//     if (options.phoneNumber) {
//       url += `?phone_number=${encodeURIComponent(options.phoneNumber)}`;
//     }
//     const response = await fetch(url, {
//       headers: {
//         Authorization: `Bearer ${token}`,
//       },
//     });
//     if (!response.ok) {
//       logger.warn('Failed to fetch whitelisted groups', {
//         status: response.status,
//         tenantId,
//       });
//       return null;
//     }
//     const whitelistedGroups = await response.json();
//     return whitelistedGroups.entries;
//   } catch (error) {
//     logger.error('Error fetching whitelisted groups:', { error: error.stack });
//     return null;
//   }
// };

/**
 * Get all the numbers that are blacklisted for a specific tenant
 * @param {string} tenantId - ID of the tenant to fetch blacklisted numbers from
 * @param {string} token - Token for the tenant
 * @returns {Array} Array of blacklisted numbers
 */

// EXTERNAL SERVICE - Blacklisted numbers function commented out
// const getBlacklistedNumbers = async (tenantId, token) => {
//   try {
//     const response = await fetch(
//       `http://${process.env.STORAGE_API_URL}/sqldb/${tenantId}/blacklisted-numbers`,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       }
//     );
//     if (!response.ok) {
//       logger.warn('Failed to fetch blacklisted numbers', {
//         status: response.status,
//         tenantId,
//       });
//       return null;
//     }
//     const blacklistedData = await response.json();
//     return blacklistedData;
//   } catch (error) {
//     logger.error('Error fetching blacklisted numbers:', { error: error.stack });
//     return null;
//   }
// };

/**
 * Get instance ID from phone number
 * @param {string} phoneNumber - Phone number to look up
 * @returns {string|null} Instance ID if found, null otherwise
 */
const getInstanceIdByPhoneNumber = (phoneNumber) => {
  // Normalize phone number (remove any + prefix)
  const normalizedPhoneNumber = phoneNumber.replace(/^\+/, '');
  // Find instance with this phone number
  for (const [instanceId, connection] of connections.entries()) {
    if (connection.phoneNumber === normalizedPhoneNumber) {
      return instanceId;
    }
  }
  return null;
};
/**
 * Restore auth folder for a specific instance from local backup
 * @param {string} instanceId - Instance ID to restore
 * @param {string} tenantId - Tenant ID for the instance
 * @returns {Promise<Object>} Object containing success status and result or error
 */
const restoreInstanceAuthFolder = async (instanceId, tenantId) => {
  try {
    const result = await localAuthFolderManager.restoreInstanceAuthFolder(instanceId, tenantId);
    return { success: true, result };
  } catch (error) {
    logger.error('Error restoring auth folder', {
      error: error.stack,
      instanceId,
      tenantId,
    });
    return { success: false, error: error.message };
  }
};

/**
 * List backups for a specific instance
 * @param {string} instanceId - Instance ID to list backups for
 * @returns {Object} Object containing success status and backups or error
 */
const listInstanceBackups = (instanceId) => {
  try {
    const backups = localAuthFolderManager.listInstanceBackups(instanceId);
    return { success: true, backups };
  } catch (error) {
    logger.error('Error listing backups', {
      error: error.stack,
      instanceId,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Get all chats for a specific WhatsApp instance
 * @param {string} phoneNumber - Phone number associated with the instance
 * @returns {Object} Object containing success status and chats or error
 */
const getInstanceChats = async (phoneNumber) => {
  const instanceId = getInstanceIdByPhoneNumber(phoneNumber);
  if (!instanceId) {
    logger.error('No instance found for phone number', { phoneNumber });
    return { success: false, error: 'No instance found for this phone number' };
  }
  const connection = connections.get(instanceId);
  if (!connection) {
    logger.error('Instance not found when fetching chats', { instanceId, phoneNumber });
    return { success: false, error: 'Instance not found' };
  }

  if (connection.state !== 'open') {
    logger.warn('WhatsApp connection not open', {
      instanceId,
      phoneNumber,
      state: connection.state,
    });
    return { success: false, error: 'WhatsApp connection not open' };
  }

  try {
    const { sock } = connection;
    const formattedChats = [];

    const groups = await sock.groupFetchAllParticipating();
    for (const [id, group] of Object.entries(groups)) {
      formattedChats.push({
        id,
        name: group.subject || '',
        isGroup: true,
        participantsCount: group.participants?.length || 0,
      });
    }
    logger.info(`Fetched ${Object.keys(groups).length} groups`, { instanceId, phoneNumber });
    return {
      success: true,
      chats: formattedChats,
    };
  } catch (error) {
    logger.error('Error fetching WhatsApp chats', {
      error: error.stack,
      instanceId,
      phoneNumber,
    });
    return {
      success: false,
      error: error.message || 'Unknown error occurred while fetching chats',
    };
  }
};

module.exports = {
  initializeConnection,
  connectToWhatsApp,
  getAllInstances,
  getInstance,
  deleteInstance,
  sendMessage,
  getInstanceChats,
  storeMessage,
  restoreInstanceAuthFolder,
  listInstanceBackups,
  connections, // Export connections map for direct access
};
