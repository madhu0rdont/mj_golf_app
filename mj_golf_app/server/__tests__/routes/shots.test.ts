import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockDbModule, resetMocks, TEST_USER_ID } from '../helpers/setup.js';

mockDbModule();

import shotsRouter from '../../routes/shots.js';

const app = createTestApp(shotsRouter);

describe('shots routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── GET / ──────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns shots with camelCase keys', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: '1', club_id: 'c1', carry_yards: 250, total_yards: 270 },
          { id: '2', club_id: 'c2', carry_yards: 150, total_yards: 160 },
        ],
      });

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: '1', clubId: 'c1', carryYards: 250, totalYards: 270 },
        { id: '2', clubId: 'c2', carryYards: 150, totalYards: 160 },
      ]);
    });

    it('scopes query to authenticated user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('shots.user_id = $1'),
        expect.arrayContaining([TEST_USER_ID]),
      );
    });

    it('uses default limit of 10000 when none provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [TEST_USER_ID, 10000],
      );
    });

    // ── since filter ──────────────────────────────────────────────
    it('filters by since timestamp and JOINs sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/?since=1700000000');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('JOIN sessions s ON s.id = shots.session_id');
      expect(sql).toContain('s.date >= $2');
      expect(mockQuery.mock.calls[0][1]).toEqual([TEST_USER_ID, 1700000000, 10000]);
    });

    it('skips session JOIN when since is not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('JOIN sessions');
    });

    // ── clubId filter ─────────────────────────────────────────────
    it('filters by clubId', async () => {
      const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get(`/?clubId=${uuid}`);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('shots.club_id = $2');
      expect(mockQuery.mock.calls[0][1]).toContain(uuid);
    });

    // ── limit ─────────────────────────────────────────────────────
    it('accepts custom limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/?limit=500');
      expect(mockQuery.mock.calls[0][1]).toContain(500);
    });

    // ── Zod validation ────────────────────────────────────────────
    it('rejects non-integer since', async () => {
      const res = await request(app).get('/?since=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('rejects negative since', async () => {
      const res = await request(app).get('/?since=-100');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('rejects non-UUID clubId', async () => {
      const res = await request(app).get('/?clubId=not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
      expect(res.body.details.clubId).toBeDefined();
    });

    it('rejects limit above 50000', async () => {
      const res = await request(app).get('/?limit=100000');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('rejects limit of 0', async () => {
      const res = await request(app).get('/?limit=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    // ── error handling ────────────────────────────────────────────
    it('returns 500 when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});
