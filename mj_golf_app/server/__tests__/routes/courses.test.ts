import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockDbModule, resetMocks } from '../helpers/setup.js';

// Mock the db module before importing the router
mockDbModule();

// Import AFTER mocking
import coursesRouter from '../../routes/courses.js';

const app = createTestApp(coursesRouter);

describe('courses routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── GET / ──────────────────────────────────────────────────────────
  describe('GET /', () => {
    it('returns courses array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'c1', name: 'Pebble Beach', par: 72, created_at: 1000 },
          { id: 'c2', name: 'Augusta National', par: 72, created_at: 2000 },
        ],
      });

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toEqual({
        id: 'c1',
        name: 'Pebble Beach',
        par: 72,
        createdAt: 1000,
      });
      expect(res.body[1].name).toBe('Augusta National');
    });
  });

  // ── GET /:id ───────────────────────────────────────────────────────
  describe('GET /:id', () => {
    it('returns full course with holes', async () => {
      // First query: course
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'c1', name: 'Pebble Beach', par: 72 }],
      });
      // Second query: holes
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'h1', course_id: 'c1', hole_number: 1, par: 4, yards: 380 },
          { id: 'h2', course_id: 'c1', hole_number: 2, par: 5, yards: 520 },
        ],
      });

      const res = await request(app).get('/c1');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Pebble Beach');
      expect(res.body.holes).toHaveLength(2);
      expect(res.body.holes[0]).toEqual({
        id: 'h1',
        courseId: 'c1',
        holeNumber: 1,
        par: 4,
        yards: 380,
      });
    });

    it('returns 404 when course not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Course not found');
    });
  });

  // ── GET /:id/holes/:number ─────────────────────────────────────────
  describe('GET /:id/holes/:number', () => {
    it('returns a single hole', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'h1', course_id: 'c1', hole_number: 7, par: 3, yards: 185 }],
      });

      const res = await request(app).get('/c1/holes/7');
      expect(res.status).toBe(200);
      expect(res.body.holeNumber).toBe(7);
      expect(res.body.par).toBe(3);
    });

    it('returns 404 when hole not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/c1/holes/99');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Hole not found');
    });

    it('with invalid hole number returns 400', async () => {
      // NaN hole number should be rejected by hardened route
      const res = await request(app).get('/c1/holes/abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ── Error handling ─────────────────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection timeout'));

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
    });
  });
});
