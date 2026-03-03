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
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM wedge_overrides WHERE user_id = $1',
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
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/')
        .send({ clubId: VALID_UUID, position: 'full', carry: 130 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wedge_overrides'),
        [VALID_UUID, 'full', 130, TEST_USER_ID],
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
        'DELETE FROM wedge_overrides WHERE club_id = $1 AND position = $2 AND user_id = $3',
        [VALID_UUID, 'full', TEST_USER_ID],
      );
    });

    it('returns 500 when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).delete(`/${VALID_UUID}/full`);
      expect(res.status).toBe(500);
    });
  });
});
