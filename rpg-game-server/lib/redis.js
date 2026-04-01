const { createClient } = require('redis');

let redisClient;
let redisReady = false;

function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  // Ready/error is tracked separately so callers can skip cache features when Redis is down.
  redisClient.on('error', (error) => {
    redisReady = false;
    console.error('[Redis error]', error.message);
  });

  redisClient.on('ready', () => {
    redisReady = true;
  });

  redisClient.connect().catch((error) => {
    redisReady = false;
    console.error('[Redis connect error]', error.message);
  });

  return redisClient;
}

function isRedisReady() {
  // Call sites use this as a lightweight feature flag around cache/session operations.
  return redisReady;
}

module.exports = {
  getRedisClient,
  isRedisReady,
};
