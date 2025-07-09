const redis = require('redis');
const config = require('./config');

// Redis client configuration
// URL: redis[s]://[[username][:password]@][host][:port][/db-number]
const redisClient = redis.createClient({
    url: config.redis.url
});

// Handle Redis connection events
redisClient.on('connect', () => {
    console.log('Redis client connected');
});

redisClient.on('error', (err) => {
    console.error('Redis client error:', err);
});

redisClient.on('ready', () => {
    console.log('Redis client ready');
});

redisClient.on('end', () => {
    console.log('Redis client disconnected');
});

// Connect to Redis
redisClient.connect().catch(console.error);

module.exports = redisClient; 