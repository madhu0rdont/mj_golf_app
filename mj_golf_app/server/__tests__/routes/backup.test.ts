import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockPool, mockClient, mockDbModule, mockWithTransaction, resetMocks } from '../helpers/setup.js';

// vi.hoisted runs before vi.mock hoisting, so the variable is available
const mockMarkPlansStale = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Mock plan-regenerator so markPlansStale's debounced regen doesn't fire
vi.mock('../../services/plan-regenerator.js', () => ({
  regenerateStalePlans: vi.fn().mockResolvedValue(undefined),
}));

// Mock game-plans route to spy on markPlansStale
vi.mock('../../routes/game-plans.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/game-plans.js')>();
  return {
    ...actual,
    markPlansStale: mockMarkPlansStale,
  };
});

// Mock the db module before importing the router
mockDbModule();

// Mock the db-columns utility
vi.mock('../../utils/db-columns.js', () => ({
  CLUB_COLUMNS: ['id', 'name', 'sort_order', 'created_at', 'updated_at'],
  SESSION_COLUMNS: ['id', 'club_id', 'date', 'shot_count', 'created_at', 'updated_at'],
  SHOT_COLUMNS: ['id', 'session_id', 'club_id', 'shot_number', 'carry_yards'],
  pickColumns: vi.fn((obj: Record<string, unknown>, _cols: string[]) => {
    // Simple pass-through for testing — convert camelCase to snake_case
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snake = key.replace(/[A-Z]/g, (c: string) => '_' + c.toLowerCase());
      result[snake] = value;
    }
    return result;
  }),
  buildInsert: vi.fn((table: string, row: Record<string, unknown>) => {
    const keys = Object.keys(row);
    const values = Object.values(row);
    const placeholders = keys.map((_: string, i: number) => `$${i + 1}`);
    return {
      text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values,
    };
  }),
}));

// Import AFTER mocking
import backupRouter from '../../routes/backup.js';

const app = createTestApp(backupRouter);

describe('backup routes', () => {
  beforeEach(() => {
    resetMocks();
    mockMarkPlansStale.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── GET /export ────────────────────────────────────────────────────
  describe('GET /export', () => {
    it('returns all data', async () => {
      // Three queries: clubs, sessions, shots
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'c1', name: 'Driver', sort_order: 0 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 's1', club_id: 'c1', date: '2025-01-01' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'sh1', session_id: 's1', carry_yards: 250 }],
        });

      const res = await request(app).get('/export');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(1);
      expect(res.body.exportedAt).toBeDefined();
      expect(res.body.clubs).toHaveLength(1);
      expect(res.body.clubs[0].name).toBe('Driver');
      expect(res.body.clubs[0].sortOrder).toBe(0); // camelCase
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.shots).toHaveLength(1);
    });
  });

  // ── POST /import ───────────────────────────────────────────────────
  describe('POST /import', () => {
    it('with valid data succeeds', async () => {
      const body = {
        version: 1,
        clubs: [{ id: 'c1', name: 'Driver', sortOrder: 0 }],
        sessions: [{ id: 's1', clubId: 'c1', date: '2025-01-01' }],
        shots: [{ id: 'sh1', sessionId: 's1', carryYards: 250 }],
      };

      const res = await request(app).post('/import').send(body);
      expect(res.status).toBe(200);
      expect(res.body.clubs).toBe(1);
      expect(res.body.sessions).toBe(1);
      expect(res.body.shots).toBe(1);
    });

    it('marks plans stale after import', async () => {
      const body = {
        version: 1,
        clubs: [{ id: 'c1', name: 'Driver', sortOrder: 0 }],
        sessions: [],
        shots: [],
      };

      await request(app).post('/import').send(body);

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Data imported from backup');
    });

    it('with non-array clubs returns 400', async () => {
      const body = {
        version: 1,
        clubs: 'not-an-array',
        sessions: [],
        shots: [],
      };

      const res = await request(app).post('/import').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
      expect(res.body.details.clubs).toBeDefined();
    });

    it('uses transaction (BEGIN/COMMIT called)', async () => {
      const body = {
        version: 1,
        clubs: [{ id: 'c1', name: 'Driver' }],
        sessions: [],
        shots: [],
      };

      await request(app).post('/import').send(body);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back transaction on error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
        if (sql.startsWith('DELETE FROM shots')) return Promise.resolve({ rows: [] });
        if (sql.startsWith('DELETE FROM sessions')) return Promise.resolve({ rows: [] });
        if (sql.startsWith('DELETE FROM clubs')) return Promise.resolve({ rows: [] });
        // Fail on INSERT
        if (sql.startsWith('INSERT')) return Promise.reject(new Error('Constraint violation'));
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      const body = {
        version: 1,
        clubs: [{ id: 'c1', name: 'Driver' }],
        sessions: [],
        shots: [],
      };

      const res = await request(app).post('/import').send(body);
      expect(res.status).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── Error handling ─────────────────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 on database error for export', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const res = await request(app).get('/export');
      expect(res.status).toBe(500);
    });
  });
});
