import mongoose from 'mongoose';
import { config } from '../config';

let isConnected = false;
let memoryServer: any = null;

// Configure global connection event listeners
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[Database] Disconnected from MongoDB cluster.');
});

mongoose.connection.on('error', (err) => {
  console.error('[Database] MongoDB connection error:', err.message);
});

export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Sanitize URI for safe logging
  const uri = config.mongodbUri;
  const sanitizedUri = uri.replace(/\/\/.*@/, '//***:***@');
  console.log(`[Database] Connecting to MongoDB: ${sanitizedUri}`);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      dbName: 'codesense_ai',
      autoIndex: config.env !== 'production', // Build indexes automatically in non-prod
    });
    isConnected = true;
    console.log(`[Database] Connected successfully to MongoDB: "${mongoose.connection.name}"`);
    return conn;
  } catch (primaryErr: any) {
    console.error(`[Database] Connection failure to ${sanitizedUri}: ${primaryErr.message}`);

    // STRICT IN-MEMORY GUARD:
    // Production NEVER falls back to in-memory database under any circumstances.
    // In dev/test, fallback is strictly restricted to automated tests or when ALLOW_MEMORY_DB=true is explicitly set.
    const isCloudUri = uri.includes('mongodb+srv://') || (!uri.includes('127.0.0.1') && !uri.includes('localhost'));
    const isExplicitlyAllowedMemory = config.env === 'test' || (config.env === 'development' && config.allowMemoryDb);

    if (config.env !== 'production' && !isCloudUri && isExplicitlyAllowedMemory) {
      try {
        console.log('[Database] Starting in-memory MongoDB fallback instance for isolated testing...');
        const memModule: any = await (Function('m', 'return import(m)')('mongodb-memory-server'));
        const MongoMemoryServer = memModule.MongoMemoryServer;
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        const conn = await mongoose.connect(memUri);
        isConnected = true;
        console.log('[Database] Connected to in-memory MongoDB fallback instance.');
        return conn;
      } catch (memErr: any) {
        console.error('[Database] In-memory MongoDB failed to initialize:', memErr.message);
        throw primaryErr;
      }
    } else {
      console.error('[Database] Silent fallback prohibited. Throwing connection error to halt startup.');
      throw primaryErr;
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  isConnected = false;
  console.log('[Database] Disconnected from MongoDB.');
}
