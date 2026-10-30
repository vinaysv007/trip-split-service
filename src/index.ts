import { createApp } from './app.js';
import { closeDb, db } from './db/index.js';
import { getEnv } from './libs/env.js';

const env = getEnv();

async function start(): Promise<void> {
  try {
    await db.execute('select 1');
    console.log('Database connection established');
  } catch (err) {
    console.error('Failed to connect to the database:', err);
    process.exit(1);
  }

  const server = createApp().listen(env.PORT, () => {
    console.log(`Server is running on port ${env.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      closeDb()
        .catch((err) => console.error('Error closing database pool:', err))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

void start();
