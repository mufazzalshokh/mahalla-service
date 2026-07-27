import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import type { MckDatabase } from './client.js';

export async function runMigrations(
  database: MckDatabase,
  migrationsFolder = resolve(process.cwd(), 'drizzle'),
): Promise<void> {
  await migrate(database, { migrationsFolder });
}
