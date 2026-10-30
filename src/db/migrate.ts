import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './index.js';

// Applies committed SQL migrations from ./drizzle. Run on deploy (`pnpm db:migrate`), not on server start.
async function main(): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
