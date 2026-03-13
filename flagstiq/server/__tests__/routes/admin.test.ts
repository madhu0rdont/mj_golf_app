import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockClient, mockDbModule, resetMocks, mockPool } from '../helpers/setup.js';

const mockMarkPlansStale = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLoadSingleHole = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockLoadCourseHoles = vi.hoisted(() => vi.fn().mockResolvedValue([]));

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

vi.mock('../../services/hole-loader.js', () => ({
  loadSingleHole: mockLoadSingleHole,
  loadCourseHoles: mockLoadCourseHoles,
}));

mockDbModule();

import adminRouter from '../../routes/admin/index.js';

const app = createTestApp(adminRouter, '/', { role: 'admin' });

describe('admin routes', () => {
  beforeEach(() => {
    resetMocks();
    mockMarkPlansStale.mockReset().mockResolvedValue(undefined);
    mockLoadSingleHole.mockReset().mockResolvedValue(null);
    mockLoadCourseHoles.mockReset().mockResolvedValue([]);
  });

  // ── PATCH /:id/holes/:number ─────────────────────────────────────
  describe('PATCH /:id/holes/:number', () => {
    it('updates hole fields and returns updated hole', async () => {
      // First query: SELECT id FROM holes (find hole)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'h1' }] });
      // Second query: UPDATE holes SET ...
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // loadSingleHole returns updated hole
      mockLoadSingleHole.mockResolvedValueOnce({
        id: 'h1', courseId: 'c1', holeNumber: 1, par: 4, handicap: 10, notes: 'test note',
      });

      const res = await request(app)
        .patch('/c1/holes/1')
        .send({ par: 4, handicap: 10, notes: 'test note' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ par: 4, handicap: 10, notes: 'test note' });
      expect(mockMarkPlansStale).toHaveBeenCalledWith('Hole data edited', 'c1');
    });

    it('returns 400 when no valid fields provided', async () => {
      // First query: find hole
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'h1' }] });

      const res = await request(app)
        .patch('/c1/holes/1')
        .send({ invalidField: 'value' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'No valid fields to update' });
    });

    it('returns 404 when hole not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .patch('/c1/holes/99')
        .send({ par: 3 });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Hole not found' });
    });

    it('filters out disallowed fields', async () => {
      // Find hole
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'h1' }] });
      // UPDATE holes
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // loadSingleHole
      mockLoadSingleHole.mockResolvedValueOnce({
        id: 'h1', courseId: 'c1', holeNumber: 1, par: 5,
      });

      const res = await request(app)
        .patch('/c1/holes/1')
        .send({ par: 5, id: 'hacked', course_id: 'hacked' });

      expect(res.status).toBe(200);
      // The UPDATE query (second call) should only set par
      const updateCall = mockQuery.mock.calls[1];
      const sql = updateCall[0] as string;
      const setClause = sql.substring(sql.indexOf('SET'), sql.indexOf('WHERE'));
      expect(setClause).toContain('par =');
      expect(setClause).not.toContain('id =');
    });
  });

  // ── DELETE /:id/holes/geofence ───────────────────────────────────
  describe('DELETE /:id/holes/geofence', () => {
    it('clears geofence data for hole range', async () => {
      // UPDATE holes (clear geometry)
      mockQuery.mockResolvedValueOnce({ rowCount: 3, rows: [] });
      // DELETE FROM hole_hazards
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

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

  // ── PUT /courses/:id/logo ───────────────────────────────────────
  describe('PUT /courses/:id/logo', () => {
    const validDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

    it('uploads a valid logo and returns updated course', async () => {
      // UPDATE returns rowCount 1
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // SELECT returns updated course
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'c1', name: 'Test Course', logo: validDataUrl, created_at: 1000, updated_at: 2000 }],
      });

      const res = await request(app)
        .put('/courses/c1/logo')
        .send({ logo: validDataUrl });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'c1', name: 'Test Course', logo: validDataUrl });
      // Verify UPDATE was called with correct params
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toMatch(/UPDATE courses SET logo/);
      expect(updateCall[1][0]).toBe(validDataUrl);
      expect(updateCall[1][2]).toBe('c1');
    });

    it('clears logo when null is sent', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'c1', name: 'Test Course', logo: null, created_at: 1000, updated_at: 2000 }],
      });

      const res = await request(app)
        .put('/courses/c1/logo')
        .send({ logo: null });

      expect(res.status).toBe(200);
      expect(res.body.logo).toBeNull();
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[1][0]).toBeNull();
    });

    it('returns 400 for non-data-URL string', async () => {
      const res = await request(app)
        .put('/courses/c1/logo')
        .send({ logo: 'https://example.com/logo.png' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/data URL/i);
    });

    it('returns 400 when logo exceeds size limit', async () => {
      const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(300_000);

      const res = await request(app)
        .put('/courses/c1/logo')
        .send({ logo: oversized });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/too large/i);
    });

    it('returns 404 when course does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app)
        .put('/courses/nonexistent/logo')
        .send({ logo: validDataUrl });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .put('/courses/c1/logo')
        .send({ logo: validDataUrl });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/internal/i);
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
