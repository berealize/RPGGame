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
  return redisReady;
}

module.exports = {
  getRedisClient,
  isRedisReady,
};
