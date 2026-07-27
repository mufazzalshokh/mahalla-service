import postgres from 'postgres';

import type { ReadinessProbe } from '../../application/health/readiness-probe.js';

export interface PostgresDependency {
  readonly probe: ReadinessProbe;
  close(): Promise<void>;
}

export function createPostgresDependency(databaseUrl: string): PostgresDependency {
  const sql = postgres(databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: 3,
    prepare: false,
  });

  return {
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
    probe: {
      async check(): Promise<void> {
        await sql`select 1 as ready`;
      },
      name: 'postgres',
    },
  };
}
