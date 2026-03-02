import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockClient, mockDbModule, resetMocks, mockPool } from '../helpers/setup.js';

const mockMarkPlansStale = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../services/plan-regenerator.js', () => ({
  regenerateStalePlans: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../routes/game-plans.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/game-plans.js')>();
  return {
    ...actual,
    markPlansStale: mockMarkPlansStale,
  };
});

vi.mock('../../services/kml-parser.js', () => ({
  parseKml: vi.fn(),
}));

vi.mock('../../services/elevation.js', () => ({
  fetchElevations: vi.fn().mockResolvedValue([]),
}));

mockDbModule();

import adminRouter from '../../routes/admin.js';

const app = createTestApp(adminRouter);

describe('admin routes', () => {
  beforeEach(() => {
    resetMocks();
    mockMarkPlansStale.mockReset().mockResolvedValue(undefined);
  });

  // ── PATCH /:id/holes/:number ─────────────────────────────────────
  describe('PATCH /:id/holes/:number', () => {
    it('updates hole fields and returns updated hole', async () => {
      // First query: UPDATE returns rowCount 1
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // Second query: SELECT returns updated hole
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'h1', course_id: 'c1', hole_number: 1, par: 4, handicap: 10, notes: 'test note' }],
      });

      const res = await request(app)
        .patch('/c1/holes/1')
        .send({ par: 4, handicap: 10, notes: 'test note' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ par: 4, handicap: 10, notes: 'test note' });
      expect(mockMarkPlansStale).toHaveBeenCalledWith('Hole data edited', 'c1');
    });

    it('returns 400 when no valid fields provided', async () => {
      const res = await request(app)
        .patch('/c1/holes/1')
        .send({ invalidField: 'value' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'No valid fields to update' });
    });

    it('returns 404 when hole not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app)
        .patch('/c1/holes/99')
        .send({ par: 3 });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Hole not found' });
    });

    it('filters out disallowed fields', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'h1', course_id: 'c1', hole_number: 1, par: 5 }],
      });

      const res = await request(app)
        .patch('/c1/holes/1')
        .send({ par: 5, id: 'hacked', course_id: 'hacked' });

      expect(res.status).toBe(200);
      // The UPDATE query should only set par, not inject id or course_id as SET clauses
      const updateCall = mockQuery.mock.calls[0];
      const sql = updateCall[0] as string;
      const setClause = sql.substring(sql.indexOf('SET'), sql.indexOf('WHERE'));
      expect(setClause).toContain('par =');
      expect(setClause).not.toContain('id =');
    });
  });

  // ── DELETE /:id/holes/geofence ───────────────────────────────────
  describe('DELETE /:id/holes/geofence', () => {
    it('clears geofence data for hole range', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3, rows: [] });

      const res = await request(app)
        .delete('/c1/holes/geofence?from=4&to=6');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cleared: 3 });
    });

    it('returns 400 for missing params', async () => {
      const res = await request(app)
        .delete('/c1/holes/geofence');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid/i);
    });

    it('returns 400 when from > to', async () => {
      const res = await request(app)
        .delete('/c1/holes/geofence?from=10&to=5');

      expect(res.status).toBe(400);
    });
  });

  // ── GET /hazard-penalties ────────────────────────────────────────
  describe('GET /hazard-penalties', () => {
    it('returns hazard penalties', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { type: 'water', penalty: 1 },
          { type: 'fairway_bunker', penalty: 0.3 },
        ],
      });

      const res = await request(app).get('/hazard-penalties');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { type: 'water', penalty: 1 },
        { type: 'fairway_bunker', penalty: 0.3 },
      ]);
    });
  });
});
