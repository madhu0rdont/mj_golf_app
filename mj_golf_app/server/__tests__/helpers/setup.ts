import express from 'express';
import { vi } from 'vitest';

/** Default test session data — player user */
export const TEST_USER_ID = 'test-user-id';
export const TEST_SESSION_DATA = {
  authenticated: true,
  userId: TEST_USER_ID,
  username: 'testuser',
  role: 'player' as const,
};

/**
 * Create a minimal Express app with JSON body parsing, mock session, and the given router mounted.
 * The mock session injects `authenticated`, `userId`, `username`, and `role` into req.session.
 */
export function createTestApp(router: express.Router, path = '/', sessionOverrides?: Partial<typeof TEST_SESSION_DATA>) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Inject mock session
  app.use((req, _res, next) => {
    const sessionData = { ...TEST_SESSION_DATA, ...sessionOverrides };
    (req as express.Request).session = {
      ...sessionData,
      id: 'test-session-id',
      cookie: {} as express.Request['session']['cookie'],
      regenerate: vi.fn() as unknown as express.Request['session']['regenerate'],
      destroy: vi.fn() as unknown as express.Request['session']['destroy'],
      reload: vi.fn() as unknown as express.Request['session']['reload'],
      resetMaxAge: vi.fn() as unknown as express.Request['session']['resetMaxAge'],
      save: vi.fn((cb?: (err?: unknown) => void) => { cb?.(); }) as unknown as express.Request['session']['save'],
      touch: vi.fn() as unknown as express.Request['session']['touch'],
    } as unknown as express.Request['session'];
    next();
  });

  app.use(path, router);
  return app;
}

/** Mockable query function — returns `{ rows: [] }` by default */
export const mockQuery = vi.fn().mockResolvedValue({ rows: [] });

/** Mock client returned by pool.connect() for transaction tests */
export const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
};

/** Mock pool */
export const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
};

/** Default withTransaction implementation — mirrors real behavior */
async function defaultWithTransaction<T>(fn: (client: typeof mockClient) => Promise<T>): Promise<T> {
  const client = await mockPool.connect();
  await client.query('BEGIN');
  try {
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

/** Mockable withTransaction */
export const mockWithTransaction = vi.fn(defaultWithTransaction);

/**
 * Call `vi.mock` for `../db.js` (the import path used by all route files).
 * Must be called at the top level of each test file.
 */
export function mockDbModule() {
  vi.mock('../../db.js', () => {
    // Re-implement toCamel / toSnake here so route code can still call them
    function toCamel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        const camel = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
        result[camel] = value;
      }
      return result as T;
    }

    function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const snake = key.replace(/[A-Z]/g, (c: string) => '_' + c.toLowerCase());
        result[snake] = value;
      }
      return result;
    }

    return {
      query: mockQuery,
      pool: mockPool,
      toCamel,
      toSnake,
      withTransaction: mockWithTransaction,
    };
  });
}

/** Reset all mocks between tests */
export function resetMocks() {
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  mockClient.query.mockReset().mockResolvedValue({ rows: [] });
  mockClient.release.mockReset();
  mockPool.connect.mockReset().mockResolvedValue(mockClient);
  mockWithTransaction.mockReset().mockImplementation(defaultWithTransaction);
}
