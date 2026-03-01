import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockDbModule, resetMocks } from '../helpers/setup.js';

// Mock the plan-regenerator module before importing the router
vi.mock('../../services/plan-regenerator.js', () => ({
  regenerateStalePlans: vi.fn().mockResolvedValue(undefined),
}));

// Mock the db module before importing the router
mockDbModule();

// Import AFTER mocking
import gamePlansRouter, { markPlansStale } from '../../routes/game-plans.js';
import { regenerateStalePlans } from '../../services/plan-regenerator.js';

const app = createTestApp(gamePlansRouter);

const SAMPLE_PLAN = {
  courseName: 'Test Course',
  teeBox: 'blue',
  mode: 'scoring',
  date: '1/1/2025',
  totalExpected: 78.5,
  breakdown: { eagle: 0, birdie: 0.1, par: 0.4, bogey: 0.3, double: 0.15, worse: 0.05 },
  keyHoles: [3, 7, 12, 15],
  totalPlaysLike: 6200,
  holes: [],
};

describe('game-plans routes', () => {
  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
    vi.mocked(regenerateStalePlans).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── GET /:courseId/:teeBox/:mode ──────────────────────────────────
  describe('GET /:courseId/:teeBox/:mode', () => {
    it('returns cached plan when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'c1_blue_scoring',
          course_id: 'c1',
          tee_box: 'blue',
          mode: 'scoring',
          plan: SAMPLE_PLAN,
          stale: false,
          stale_reason: null,
          created_at: 1000,
          updated_at: 2000,
        }],
      });

      const res = await request(app).get('/c1/blue/scoring');
      expect(res.status).toBe(200);
      expect(res.body.courseId).toBe('c1');
      expect(res.body.teeBox).toBe('blue');
      expect(res.body.mode).toBe('scoring');
      expect(res.body.plan).toEqual(SAMPLE_PLAN);
      expect(res.body.stale).toBe(false);
      expect(res.body.createdAt).toBe(1000);
      expect(res.body.updatedAt).toBe(2000);
    });

    it('returns 404 when no cached plan exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/c1/blue/scoring');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No cached plan');
    });

    it('returns stale plan with reason', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'c1_blue_scoring',
          course_id: 'c1',
          tee_box: 'blue',
          mode: 'scoring',
          plan: SAMPLE_PLAN,
          stale: true,
          stale_reason: 'New practice data recorded',
          created_at: 1000,
          updated_at: 2000,
        }],
      });

      const res = await request(app).get('/c1/blue/scoring');
      expect(res.status).toBe(200);
      expect(res.body.stale).toBe(true);
      expect(res.body.staleReason).toBe('New practice data recorded');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/c1/blue/scoring');
      expect(res.status).toBe(500);
    });
  });

  // ── PUT /:courseId/:teeBox/:mode ──────────────────────────────────
  describe('PUT /:courseId/:teeBox/:mode', () => {
    it('upserts plan and returns success', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/c1/blue/scoring')
        .send({ plan: SAMPLE_PLAN });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.updatedAt).toBeDefined();

      // Verify the upsert query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO game_plan_cache'),
        expect.arrayContaining(['c1_blue_scoring', 'c1', 'blue', 'scoring']),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.anything(),
      );
    });

    it('clears stale flag on upsert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .put('/c1/blue/scoring')
        .send({ plan: SAMPLE_PLAN });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('stale = FALSE'),
        expect.anything(),
      );
    });

    it('rejects request without plan body', async () => {
      const res = await request(app)
        .put('/c1/blue/scoring')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('plan is required');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .put('/c1/blue/scoring')
        .send({ plan: SAMPLE_PLAN });

      expect(res.status).toBe(500);
    });
  });

  // ── DELETE /:courseId ─────────────────────────────────────────────
  describe('DELETE /:courseId', () => {
    it('purges all plans for a course', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/c1');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM game_plan_cache WHERE course_id = $1',
        ['c1'],
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).delete('/c1');
      expect(res.status).toBe(500);
    });
  });

  // ── markPlansStale helper ────────────────────────────────────────
  describe('markPlansStale', () => {
    it('marks all courses stale when no courseId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await markPlansStale('New practice data recorded');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE game_plan_cache SET stale = TRUE, stale_reason = $1 WHERE stale = FALSE',
        ['New practice data recorded'],
      );
    });

    it('marks only specific course stale when courseId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await markPlansStale('Hole data edited', 'c1');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE game_plan_cache SET stale = TRUE, stale_reason = $1 WHERE course_id = $2 AND stale = FALSE',
        ['Hole data edited', 'c1'],
      );
    });

    it('triggers debounced regeneration after marking stale', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await markPlansStale('Club bag changed');

      // Should not fire immediately
      expect(regenerateStalePlans).not.toHaveBeenCalled();

      // Advance past 5s debounce
      vi.advanceTimersByTime(5000);

      expect(regenerateStalePlans).toHaveBeenCalledOnce();
    });

    it('debounces multiple rapid calls', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await markPlansStale('Club bag changed');
      vi.advanceTimersByTime(2000);
      await markPlansStale('Club settings changed');
      vi.advanceTimersByTime(2000);
      await markPlansStale('Club removed');

      // Only 4s total since last call — should not fire yet
      expect(regenerateStalePlans).not.toHaveBeenCalled();

      // Advance remaining 5s from last call
      vi.advanceTimersByTime(5000);

      // Should only fire once (debounced)
      expect(regenerateStalePlans).toHaveBeenCalledOnce();
    });
  });

  // ── History endpoints ────────────────────────────────────────────
  describe('GET /history/:courseId/:teeBox/:mode', () => {
    it('returns history entries for charting', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'h1', total_expected: 78.5, trigger_reason: 'New practice data recorded', created_at: 2000 },
          { id: 'h2', total_expected: 79.2, trigger_reason: 'Club settings changed', created_at: 1000 },
        ],
      });

      const res = await request(app).get('/history/c1/blue/scoring');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe('h1');
      expect(res.body[0].totalExpected).toBe(78.5);
      expect(res.body[0].triggerReason).toBe('New practice data recorded');
      expect(res.body[0].createdAt).toBe(2000);
    });

    it('returns empty array when no history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/history/c1/blue/scoring');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('queries with correct parameters and limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/history/c1/blue/scoring');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM game_plan_history'),
        ['c1', 'blue', 'scoring'],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 100'),
        expect.anything(),
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/history/c1/blue/scoring');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /history/:courseId/:teeBox/:mode/:id', () => {
    it('returns full historical plan', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'h1',
          course_id: 'c1',
          tee_box: 'blue',
          mode: 'scoring',
          total_expected: 78.5,
          plan: SAMPLE_PLAN,
          trigger_reason: 'Club bag changed',
          created_at: 1000,
        }],
      });

      const res = await request(app).get('/history/c1/blue/scoring/h1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('h1');
      expect(res.body.plan).toEqual(SAMPLE_PLAN);
      expect(res.body.totalExpected).toBe(78.5);
      expect(res.body.triggerReason).toBe('Club bag changed');
    });

    it('returns 404 when history entry not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/history/c1/blue/scoring/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('History entry not found');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/history/c1/blue/scoring/h1');
      expect(res.status).toBe(500);
    });
  });
});
