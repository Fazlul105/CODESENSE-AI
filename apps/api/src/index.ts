import app from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './database/db';

async function bootstrap() {
  try {
    await connectDatabase();

    const server = app.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(`  CodeSense AI Backend API`);
      console.log(`  Environment: ${config.env}`);
      console.log(`  Listening on: http://localhost:${config.port}`);
      console.log(`  Health Check: http://localhost:${config.port}/api/health`);
      console.log(`===============================================`);
    });

    const shutdown = async (signal: string) => {
      console.log(`[Process] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err: any) {
    console.error('[Bootstrap Error] Failed to start CodeSense AI API:', err);
    process.exit(1);
  }
}

bootstrap();
