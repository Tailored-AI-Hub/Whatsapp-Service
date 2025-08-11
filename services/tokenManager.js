const logger = require('../utils/logger');
require('dotenv').config();

async function getToken() {
  try {
    logger.info(
      `Getting token with username ${process.env.SQDB_USERNAME} with url http://${process.env.STORAGE_API_URL}/api/token/`
    );
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: process.env.SQDB_USERNAME,
        password: process.env.SQDB_PASSWORD,
      }),
    };
    const tokenResponse = await fetch(`http://${process.env.STORAGE_API_URL}/api/token/`, options);

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access) {
      throw new Error('Token response did not contain access token');
    }

    return tokenData.access;
  } catch (error) {
    logger.error('Error getting authentication token:', { error: error.message });
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

module.exports = { getToken };
