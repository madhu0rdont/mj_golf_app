import pg from 'pg';

// Parse BIGINT (OID 20) as JavaScript numbers instead of strings.
// Our BIGINT columns are epoch-ms timestamps, safely within Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export { pool };

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Convert snake_case DB row to camelCase object */
export function toCamel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
  }
  return result as T;
}

/** Convert camelCase object to snake_case for DB inserts */
export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    result[snake] = value;
  }
  return result;
}
