import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { config } from './config';
import { initDb, closeDb } from './db';
import { runMigrations } from './migrate';
import { runSeeds } from './seed';
import { logger } from './logger';
import app from './app';

async function main(): Promise<void> {
  logger.info({ env: config.NODE_ENV }, 'Starting Dogfood platform...');

  await initDb();
  await runMigrations();

  if (config.NODE_ENV !== 'production') {
    await runSeeds();
    try {
      const pool = require('./db').getPool();
      const { rows } = await pool.query('SELECT count(*) FROM hackathons');
      if (parseInt(rows[0].count) === 0) {
        const { seedFixtures } = await import('./seed-fixtures');
        await seedFixtures();
      }
    } catch (e) {
      logger.info('seedFixtures not available or failed');
    }
  }

  const { startWebhookWorker } = await import('./workers/webhook.worker');
  startWebhookWorker();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Dogfood platform is running');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    server.close(async () => {
      await closeDb();
      logger.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
