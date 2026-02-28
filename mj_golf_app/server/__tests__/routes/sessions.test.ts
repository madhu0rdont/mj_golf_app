import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockPool, mockClient, mockDbModule, mockWithTransaction, resetMocks } from '../helpers/setup.js';

// Mock the db module
mockDbModule();

// Mock shot classifier
vi.mock('../../services/shot-classifier.js', () => ({
  classifyAllShots: vi.fn((shots: Record<string, unknown>[]) =>
    shots.map((s) => ({ ...s, quality: 'good', shape: 'straight' }))
  ),
}));

// Import AFTER mocking
import sessionsRouter from '../../routes/sessions.js';

const app = createTestApp(sessionsRouter);

describe('sessions routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── GET / ──────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns paginated sessions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 's1', club_id: 'c1', date: '2025-01-01', shot_count: 10 },
          { id: 's2', club_id: 'c2', date: '2025-01-02', shot_count: 5 },
        ],
      });

      const res = await request(app).get('/?limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toEqual({
        id: 's1',
        clubId: 'c1',
        date: '2025-01-01',
        shotCount: 10,
      });
    });

    it('filters by clubId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/?clubId=c1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE club_id = $1'),
        expect.arrayContaining(['c1'])
      );
    });
  });

  // ── GET /:id ───────────────────────────────────────────────────────
  describe('GET /:id', () => {
    it('returns single session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 's1', club_id: 'c1', date: '2025-01-01', shot_count: 10 }],
      });

      const res = await request(app).get('/s1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('s1');
      expect(res.body.clubId).toBe('c1');
    });

    it('returns 404 when session not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });

  // ── POST / ─────────────────────────────────────────────────────────
  describe('POST /', () => {
    it('creates session with shots in transaction', async () => {
      const body = {
        clubId: 'c1',
        type: 'block',
        date: '2025-01-01',
        source: 'manual',
        shots: [
          { carryYards: 150, totalYards: 160, ballSpeed: 120 },
          { carryYards: 155, totalYards: 165, ballSpeed: 122 },
        ],
      };

      const res = await request(app).post('/').send(body);
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.shotCount).toBe(2);

      // Verify transaction was used
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rejects invalid session type with 400', async () => {
      const body = {
        clubId: 'c1',
        type: 'invalid',
        date: '2025-01-01',
        source: 'manual',
        shots: [{ carryYards: 150 }],
      };

      const res = await request(app).post('/').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid session type');
    });

    it('rejects empty shots array with 400', async () => {
      const body = {
        clubId: 'c1',
        type: 'block',
        date: '2025-01-01',
        source: 'manual',
        shots: [],
      };

      const res = await request(app).post('/').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least one shot');
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────
  describe('DELETE /:id', () => {
    it('deletes session and its shots', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/s1');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE id = $1',
        ['s1']
      );
    });
  });

  // ── Error handling ─────────────────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
    });
  });
});
