import 'dotenv/config';

import { loadEnvironment } from '../../config/environment.js';
import { createDatabaseClient } from './client.js';
import { seedFoundation } from './seed-runner.js';

const environment = loadEnvironment(process.env);
const database = createDatabaseClient(environment.DATABASE_URL, 1);

try {
  await seedFoundation(database.db);
  console.log('Foundation seed completed');
} finally {
  await database.close();
}
