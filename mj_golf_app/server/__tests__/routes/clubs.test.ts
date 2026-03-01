import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockClient, mockDbModule, resetMocks } from '../helpers/setup.js';

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

// Import AFTER mocking
import clubsRouter from '../../routes/clubs.js';

const app = createTestApp(clubsRouter);

describe('clubs routes', () => {
  beforeEach(() => {
    resetMocks();
    mockMarkPlansStale.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── GET / ──────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns clubs array with camelCase keys', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: '1', name: 'Driver', sort_order: 0, created_at: 1000 },
          { id: '2', name: '7 Iron', sort_order: 1, created_at: 2000 },
        ],
      });

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: '1', name: 'Driver', sortOrder: 0, createdAt: 1000 },
        { id: '2', name: '7 Iron', sortOrder: 1, createdAt: 2000 },
      ]);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM clubs ORDER BY sort_order');
    });
  });

  // ── GET /:id ───────────────────────────────────────────────────────
  describe('GET /:id', () => {
    it('returns a single club', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'abc', name: 'PW', sort_order: 5 }],
      });

      const res = await request(app).get('/abc');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'abc', name: 'PW', sortOrder: 5 });
    });

    it('returns 404 when club not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Club not found');
    });
  });

  // ── POST / ─────────────────────────────────────────────────────────
  describe('POST /', () => {
    it('creates club with valid data, returns 201', async () => {
      // First query: get max sort_order
      mockQuery.mockResolvedValueOnce({ rows: [{ max_order: 2 }] });
      // Second query: INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/')
        .send({ name: 'New Club', category: 'iron' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Club');
      expect(res.body.category).toBe('iron');
      expect(res.body.sortOrder).toBe(3);
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    });

    it('marks plans stale after creating club', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_order: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .post('/')
        .send({ name: 'New Club', category: 'iron' });

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Club bag changed');
    });

    it('with missing name returns 400', async () => {
      const res = await request(app)
        .post('/')
        .send({ category: 'iron' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ── PUT /:id ───────────────────────────────────────────────────────
  describe('PUT /:id', () => {
    it('updates club and returns updated record', async () => {
      // First call: UPDATE query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: SELECT after update
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'abc', name: 'Updated Club', sort_order: 0 }],
      });

      const res = await request(app)
        .put('/abc')
        .send({ name: 'Updated Club' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Club');
    });

    it('marks plans stale after updating club', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'abc', name: 'Updated', sort_order: 0 }],
      });

      await request(app)
        .put('/abc')
        .send({ name: 'Updated' });

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Club settings changed');
    });
  });

  // ── PUT /reorder ───────────────────────────────────────────────────
  describe('PUT /reorder', () => {
    it('with valid orderedIds array succeeds', async () => {
      const res = await request(app)
        .put('/reorder')
        .send({ orderedIds: ['id1', 'id2', 'id3'] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Uses withTransaction — BEGIN + 3 UPDATEs + COMMIT
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('with non-array body returns 400', async () => {
      const res = await request(app)
        .put('/reorder')
        .send({ orderedIds: 'not-an-array' });

      // Expect 400 from hardened validation
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────
  describe('DELETE /:id', () => {
    it('deletes club and its sessions in transaction', async () => {
      const res = await request(app).delete('/abc');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Uses withTransaction — deletes sessions then club
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE club_id = $1',
        ['abc']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM clubs WHERE id = $1',
        ['abc']
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('marks plans stale after deleting club', async () => {
      await request(app).delete('/abc');

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Club removed');
    });
  });

  // ── Error handling ─────────────────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
    });
  });
});
