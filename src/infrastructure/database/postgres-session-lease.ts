import type { Sql } from 'postgres';

export interface PostgresSessionLease {
  close(): Promise<void>;
}

export async function tryAcquirePostgresSessionLease(
  sql: Sql,
  lockKey: bigint,
): Promise<PostgresSessionLease | undefined> {
  if (lockKey < -9_223_372_036_854_775_808n || lockKey > 9_223_372_036_854_775_807n) {
    throw new RangeError('PostgreSQL advisory-lock key must be a signed 64-bit integer');
  }
  const lockLiteral = lockKey.toString();
  const connection = await sql.reserve();
  try {
    const [result] = await connection.unsafe<{ acquired: boolean }[]>(
      `select pg_try_advisory_lock(${lockLiteral}::bigint) as acquired`,
    );
    if (!result?.acquired) {
      connection.release();
      return undefined;
    }
  } catch (error: unknown) {
    connection.release();
    throw error;
  }

  let closed = false;
  return {
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await connection.unsafe(`select pg_advisory_unlock(${lockLiteral}::bigint)`);
      } finally {
        connection.release();
      }
    },
  };
}
