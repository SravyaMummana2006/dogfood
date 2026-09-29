import { runMigrations } from './src/migrate';

runMigrations()
  .then(() => {
    console.log('MIGRATIONS COMPLETE');
    process.exit(0);
  })
  .catch((err) => {
    console.error('MIGRATION FAILED:', err);
    process.exit(1);
  });
