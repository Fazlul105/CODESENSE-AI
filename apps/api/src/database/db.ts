import mongoose from 'mongoose';
import { config } from '../config';

let isConnected = false;
let memoryServer: any = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Attempt to connect to the configured URI (MongoDB Atlas or local daemon)
  const uri = config.mongodbUri;
  console.log(`[Database] Attempting connection to MongoDB at: ${uri.replace(/\/\/.*@/, '//***:***@')}`);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      dbName: 'codesense_ai',
    });
    isConnected = true;
    console.log(`[Database] Connected successfully to MongoDB: "${mongoose.connection.name}" on host "${mongoose.connection.host}"`);
    return conn;
  } catch (primaryErr: any) {
    console.warn(`[Database] Failed to connect to ${uri.replace(/\/\/.*@/, '//***:***@')}: ${primaryErr.message}`);
    
    // In development or test, fall back to MongoMemoryServer only if no explicit cloud/Atlas URI was configured.
    // Explicit Atlas or production connection errors MUST throw to prevent silent fallback and data loss.
    const isExplicitCloudUri = uri.includes('mongodb+srv://') || (Boolean(process.env.MONGODB_URI) && !process.env.MONGODB_URI?.includes('127.0.0.1'));
    if ((config.env === 'development' || config.env === 'test') && !isExplicitCloudUri) {
      try {
        console.log('[Database] Starting in-memory MongoDB server for seamless local testing...');
        const memModule: any = await (Function('m', 'return import(m)')('mongodb-memory-server'));
        const MongoMemoryServer = memModule.MongoMemoryServer;
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        const conn = await mongoose.connect(memUri);
        isConnected = true;
        console.log('[Database] Connected to in-memory MongoDB fallback instance.');
        console.log('[Database] TIP: Configure MONGODB_URI in .env with your MongoDB Atlas connection string for persistent cloud storage.');
        return conn;
      } catch (memErr: any) {
        console.error('[Database] In-memory MongoDB failed to initialize:', memErr.message);
        throw primaryErr;
      }
    } else {
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
