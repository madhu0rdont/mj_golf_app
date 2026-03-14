import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockDbModule, resetMocks, TEST_USER_ID } from '../helpers/setup.js';

mockDbModule();

import wedgeOverridesRouter from '../../routes/wedge-overrides.js';

const app = createTestApp(wedgeOverridesRouter);

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('wedge-overrides routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── GET / ──────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns overrides with camelCase keys', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { club_id: VALID_UUID, position: 'full', carry: 130 },
          { club_id: VALID_UUID, position: '3/4', carry: 115 },
        ],
      });

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { clubId: VALID_UUID, position: 'full', carry: 130 },
        { clubId: VALID_UUID, position: '3/4', carry: 115 },
      ]);
    });

    it('scopes query to authenticated user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/');
      // Query joins through club_distance_profiles → club_profiles → bag_clubs
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('bag_clubs'),
        [TEST_USER_ID],
      );
    });

    it('returns 500 when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
    });
  });

  // ── PUT / ──────────────────────────────────────────────────────────
  describe('PUT /', () => {
    it('upserts override with valid data', async () => {
      // First query: find existing profile
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });
      // Second query: INSERT INTO club_distance_profiles
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: 130 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO club_distance_profiles'),
        expect.arrayContaining(['profile-1', 'full', 130]),
      );
    });

    it('creates manual profile if none exists', async () => {
      // First query: no existing profile
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Second query: INSERT INTO club_profiles (RETURNING id)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-profile' }] });
      // Third query: INSERT INTO club_distance_profiles
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: 130 });

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO club_profiles'),
        expect.arrayContaining([VALID_UUID]),
      );
    });

    // ── Zod validation ────────────────────────────────────────────
    it('rejects missing clubId', async () => {
      const res = await request(app)
        .put('/')
        .send({ position: 'full', carry: 130 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
      expect(res.body.details.clubId).toBeDefined();
    });

    it('rejects non-UUID clubId', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: 'not-a-uuid', position: 'full', carry: 130 });

      expect(res.status).toBe(400);
      expect(res.body.details.clubId).toBeDefined();
    });

    it('rejects missing position', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, carry: 130 });

      expect(res.status).toBe(400);
      expect(res.body.details.position).toBeDefined();
    });

    it('rejects empty position', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: '', carry: 130 });

      expect(res.status).toBe(400);
      expect(res.body.details.position).toBeDefined();
    });

    it('rejects missing carry', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full' });

      expect(res.status).toBe(400);
      expect(res.body.details.carry).toBeDefined();
    });

    it('rejects zero carry', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: 0 });

      expect(res.status).toBe(400);
      expect(res.body.details.carry).toBeDefined();
    });

    it('rejects negative carry', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: -10 });

      expect(res.status).toBe(400);
      expect(res.body.details.carry).toBeDefined();
    });

    it('rejects string carry', async () => {
      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.details.carry).toBeDefined();
    });

    it('returns 500 when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: 130 });

      expect(res.status).toBe(500);
    });
  });

  // ── DELETE /:clubId/:position ──────────────────────────────────────
  describe('DELETE /:clubId/:position', () => {
    it('deletes override scoped to user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete(`/${VALID_UUID}/full`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM club_distance_profiles'),
        ['full', VALID_UUID, TEST_USER_ID],
      );
    });

    it('returns 500 when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).delete(`/${VALID_UUID}/full`);
      expect(res.status).toBe(500);
    });
  });
});
