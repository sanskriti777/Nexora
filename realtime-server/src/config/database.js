import mongoose from 'mongoose';

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/nexora_chat';

/**
 * Connect to MongoDB instance using Mongoose
 *
 * @param {string} [customUri] Optional URI override (useful for tests)
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB(customUri) {
  const uri = customUri || process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[MongoDB] Connected to: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    throw error;
  }
}

/**
 * Disconnect from MongoDB instance
 *
 * @returns {Promise<void>}
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected successfully');
  }
}

/**
 * Check whether MongoDB connection is currently established
 *
 * @returns {boolean}
 */
export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

export default {
  connectDB,
  disconnectDB,
  isDBConnected,
};
