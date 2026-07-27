import 'dotenv/config';

import { loadEnvironment } from '../../config/environment.js';
import { createDatabaseClient } from './client.js';
import { runMigrations } from './migration-runner.js';

const environment = loadEnvironment(process.env);
const database = createDatabaseClient(environment.DATABASE_URL, 1);

try {
  await runMigrations(database.db);
  console.log('Database migrations completed');
} finally {
  await database.close();
}
