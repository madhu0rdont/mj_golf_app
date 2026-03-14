import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockClient, mockDbModule, resetMocks, TEST_USER_ID } from '../helpers/setup.js';

// vi.hoisted runs before vi.mock hoisting, so the variable is available
const mockMarkPlansStale = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLoadUserClubs = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockLoadSingleClub = vi.hoisted(() => vi.fn().mockResolvedValue(null));

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

vi.mock('../../services/club-loader.js', () => ({
  loadUserClubs: mockLoadUserClubs,
  loadSingleClub: mockLoadSingleClub,
}));

// Mock the db module before importing the router
mockDbModule();

// Import AFTER mocking
import clubsRouter from '../../routes/clubs.js';

const app = createTestApp(clubsRouter);

describe('clubs routes', () => {
  beforeEach(() => {
    resetMocks();
    mockMarkPlansStale.mockReset().mockResolvedValue(undefined);
    mockLoadUserClubs.mockReset().mockResolvedValue([]);
    mockLoadSingleClub.mockReset().mockResolvedValue(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── GET / ──────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns clubs array', async () => {
      mockLoadUserClubs.mockResolvedValueOnce([
        { id: '1', name: 'Driver', sortOrder: 0, createdAt: 1000 },
        { id: '2', name: '7 Iron', sortOrder: 1, createdAt: 2000 },
      ]);

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: '1', name: 'Driver', sortOrder: 0, createdAt: 1000 },
        { id: '2', name: '7 Iron', sortOrder: 1, createdAt: 2000 },
      ]);
      expect(mockLoadUserClubs).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });

  // ── GET /:id ───────────────────────────────────────────────────────
  describe('GET /:id', () => {
    it('returns a single club', async () => {
      mockLoadSingleClub.mockResolvedValueOnce({ id: 'abc', name: 'PW', sortOrder: 5 });

      const res = await request(app).get('/abc');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'abc', name: 'PW', sortOrder: 5 });
      expect(mockLoadSingleClub).toHaveBeenCalledWith(TEST_USER_ID, 'abc');
    });

    it('returns 404 when club not found', async () => {
      mockLoadSingleClub.mockResolvedValueOnce(null);

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
      // Second query: INSERT into bag_clubs
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // loadSingleClub returns new club
      mockLoadSingleClub.mockResolvedValueOnce({
        id: 'new-id', name: 'New Club', category: 'iron', sortOrder: 3, createdAt: 1000, updatedAt: 1000,
      });

      const res = await request(app)
        .post('/')
        .send({ name: 'New Club', category: 'iron' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Club');
      expect(res.body.category).toBe('iron');
      expect(res.body.sortOrder).toBe(3);
    });

    it('marks plans stale after creating club', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_order: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockLoadSingleClub.mockResolvedValueOnce({ id: 'x', name: 'X', sortOrder: 1 });

      await request(app)
        .post('/')
        .send({ name: 'New Club', category: 'iron' });

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Club bag changed', undefined, TEST_USER_ID);
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
      // UPDATE bag_clubs
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // loadSingleClub returns updated
      mockLoadSingleClub.mockResolvedValueOnce({ id: 'abc', name: 'Updated Club', sortOrder: 0 });

      const res = await request(app)
        .put('/abc')
        .send({ name: 'Updated Club' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Club');
    });

    it('marks plans stale after updating club', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockLoadSingleClub.mockResolvedValueOnce({ id: 'abc', name: 'Updated', sortOrder: 0 });

      await request(app)
        .put('/abc')
        .send({ name: 'Updated' });

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Club settings changed', undefined, TEST_USER_ID);
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

      // Uses withTransaction — deletes sessions then bag_clubs (user-scoped)
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE club_id = $1 AND user_id = $2',
        ['abc', TEST_USER_ID]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM bag_clubs WHERE id = $1 AND user_id = $2',
        ['abc', TEST_USER_ID]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('marks plans stale after deleting club', async () => {
      await request(app).delete('/abc');

      expect(mockMarkPlansStale).toHaveBeenCalledWith('Club removed', undefined, TEST_USER_ID);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 when query throws', async () => {
      mockLoadUserClubs.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
    });
  });
});
