import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Drizzle commands');

export default defineConfig({
  dbCredentials: { url: databaseUrl },
  dialect: 'postgresql',
  migrations: {
    prefix: 'timestamp',
  },
  out: './drizzle',
  schema: './src/infrastructure/database/schema.ts',
  strict: true,
  verbose: true,
});
