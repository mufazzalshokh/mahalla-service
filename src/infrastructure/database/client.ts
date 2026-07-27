import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

export type MckDatabase = PostgresJsDatabase<typeof schema>;

export interface DatabaseClient {
  readonly db: MckDatabase;
  readonly sql: Sql;
  close(): Promise<void>;
}

export function createDatabaseClient(databaseUrl: string, maxConnections = 10): DatabaseClient {
  const sql = postgres(databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: maxConnections,
    prepare: false,
  });
  const db = drizzle(sql, { schema });

  return {
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
    db,
    sql,
  };
}
