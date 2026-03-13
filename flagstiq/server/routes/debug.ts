import { Router } from 'express';
import { pool, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// All debug endpoints require admin access
router.use(requireAdmin);

// GET /api/debug/plan-clubs/:courseId — list all clubs used across the plan
router.get('/plan-clubs/:courseId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT plan FROM game_plan_cache WHERE course_id = $1 AND stale = false LIMIT 1`,
      [req.params.courseId],
    );
    if (rows.length === 0) return res.json({ error: 'no plan' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = (rows[0] as any).plan;
    const clubSet = new Set<string>();
    for (const hole of plan?.holes ?? []) {
      for (const strat of hole?.allStrategies ?? []) {
        for (const ap of strat?.aimPoints ?? []) {
          clubSet.add(`${ap.clubName} (${ap.carry}y)`);
        }
      }
    }
    res.json({ clubsUsed: [...clubSet].sort() });
  } catch (err) {
    logger.error('Debug plan-clubs failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/plan-qc/:courseId — raw plan structure for a specific hole
router.get('/plan-qc/:courseId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tee_box, mode, plan FROM game_plan_cache WHERE course_id = $1 AND stale = false LIMIT 1`,
      [req.params.courseId],
    );
    if (rows.length === 0) return res.json({ error: 'no plan' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = (rows[0] as any).plan;
    const holeIdx = parseInt(req.query.hole as string || '3') - 1;
    const hole3 = plan?.holes?.[holeIdx];
    res.json({
      totalExpected: plan?.totalExpected,
      holeCount: plan?.holes?.length,
      hole3Keys: hole3 ? Object.keys(hole3) : [],
      hole3: hole3 ? JSON.parse(JSON.stringify(hole3, (k, v) => {
        if (k === 'polygon' && Array.isArray(v)) return `[${v.length} points]`;
        return v;
      })) : null,
    });
  } catch (err) {
    logger.error('Debug plan-qc failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/tee-keys/:courseId — yardage keys and game plan tee_box values
router.get('/tee-keys/:courseId', async (req, res) => {
  try {
    const cid = req.params.courseId;
    const { rows: holes } = await pool.query(
      'SELECT hole_number, yardages FROM course_holes WHERE course_id = $1 ORDER BY hole_number LIMIT 1',
      [cid],
    );
    const { rows: plans } = await pool.query(
      'SELECT tee_box, mode FROM game_plan_cache WHERE course_id = $1',
      [cid],
    );
    res.json({
      yardageKeys: holes[0] ? Object.keys(holes[0].yardages) : [],
      cachedPlans: plans.map((p: Record<string, unknown>) => ({ teeBox: p.tee_box, mode: p.mode })),
    });
  } catch (err) {
    logger.error('Debug tee-keys failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/courses — list courses with metadata
router.get('/courses', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.par, c.slope, c.rating, c.tee_sets IS NOT NULL as has_tee_sets,
        (SELECT COUNT(*)::int FROM course_holes ch WHERE ch.course_id = c.id AND ch.handicap IS NOT NULL) as holes_with_hcp,
        (SELECT COUNT(*)::int FROM course_holes ch WHERE ch.course_id = c.id) as total_holes
      FROM courses c ORDER BY c.name
    `);
    res.json(rows);
  } catch (err) {
    logger.error('Debug courses failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/hole-green/:courseId/:holeNumber — check green/fairway polygon
router.get('/hole-green/:courseId/:holeNumber', async (req, res) => {
  try {
    const holeNumber = parseInt(req.params.holeNumber);
    if (isNaN(holeNumber)) return res.status(400).json({ error: 'Hole number must be a valid number' });

    const { rows } = await pool.query(
      'SELECT hole_number, green, fairway FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [req.params.courseId, holeNumber],
    );
    if (rows.length === 0) return res.json({ error: 'not found' });
    const hole = rows[0];
    const green = hole.green as { lat: number; lng: number }[] | null;
    const fairway = hole.fairway as { lat: number; lng: number }[][] | null;
    res.json({
      holeNumber: hole.hole_number,
      greenPoints: green?.length ?? 0,
      green: green,
      fairwayPolygons: fairway?.length ?? 0,
      fairwayPointCounts: fairway?.map((f: { lat: number; lng: number }[]) => f.length) ?? [],
      fairway: fairway,
    });
  } catch (err) {
    logger.error('Debug hole-green failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/hole-hazards/:courseId/:holeNumber — check hole hazard data
router.get('/hole-hazards/:courseId/:holeNumber', async (req, res) => {
  try {
    const holeNumber = parseInt(req.params.holeNumber);
    if (isNaN(holeNumber)) return res.status(400).json({ error: 'Hole number must be a valid number' });

    const { rows } = await pool.query(
      'SELECT hole_number, hazards, tee, pin, notes FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [req.params.courseId, holeNumber],
    );
    if (rows.length === 0) return res.json({ error: 'not found' });
    const hole = rows[0];
    const hazards = (hole.hazards ?? []) as { name: string; type: string; penalty: number; polygon: { lat: number; lng: number }[] }[];
    const full = req.query.full === '1';
    const centerLine = hole.center_line as { lat: number; lng: number }[] | null;
    res.json({
      holeNumber: hole.hole_number,
      tee: hole.tee,
      pin: hole.pin,
      notes: hole.notes,
      centerLinePoints: centerLine?.length ?? 0,
      hazardCount: hazards.length,
      hazards: hazards.map((h) => ({
        name: h.name,
        type: h.type,
        penalty: h.penalty,
        polygonPoints: h.polygon?.length ?? 0,
        ...(full && { polygon: h.polygon }),
      })),
    });
  } catch (err) {
    logger.error('Debug hole-hazards failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/fix-elevations/:courseId — fetch & update missing elevation data (WRITES DB)
router.get('/fix-elevations/:courseId', async (req, res) => {
  try {
    const { fetchElevations } = await import('../services/elevation.js');
    const courseId = req.params.courseId;
    const { rows } = await pool.query(
      'SELECT id, hole_number, tee, pin FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );
    const coords: { lat: number; lng: number }[] = [];
    const holeMap: { holeId: string; field: string; idx: number }[] = [];
    for (const row of rows) {
      const tee = row.tee as { lat: number; lng: number; elevation?: number };
      const pin = row.pin as { lat: number; lng: number; elevation?: number };
      if (tee.elevation == null) {
        holeMap.push({ holeId: row.id, field: 'tee', idx: coords.length });
        coords.push({ lat: Number(tee.lat), lng: Number(tee.lng) });
      }
      if (pin.elevation == null) {
        holeMap.push({ holeId: row.id, field: 'pin', idx: coords.length });
        coords.push({ lat: Number(pin.lat), lng: Number(pin.lng) });
      }
    }
    if (coords.length === 0) return res.json({ fixed: 0 });
    const elevResults = await fetchElevations(coords);
    for (const entry of holeMap) {
      await pool.query(
        `UPDATE course_holes SET ${entry.field} = jsonb_set(${entry.field}::jsonb, '{elevation}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(elevResults[entry.idx].elevation), entry.holeId],
      );
    }
    // Mark plans stale so they regenerate with correct elevation
    await pool.query(
      `UPDATE game_plan_cache SET stale = TRUE, stale_reason = 'Elevation data fixed' WHERE course_id = $1`,
      [courseId],
    );
    res.json({ fixed: coords.length });
  } catch (err) {
    logger.error('Debug fix-elevations failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/anchors/:courseId/:holeNumber — anchor positions and lies for a hole
router.get('/anchors/:courseId/:holeNumber', async (req, res) => {
  try {
    const holeNumber = parseInt(req.params.holeNumber);
    if (isNaN(holeNumber)) return res.status(400).json({ error: 'Hole number must be a valid number' });

    const { discretizeHole } = await import('../services/dp-optimizer.js');
    const courseId = req.params.courseId;
    const teeBox = (req.query.tee as string) || 'blue';

    const { rows } = await pool.query(
      'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [courseId, holeNumber],
    );
    if (rows.length === 0) return res.json({ error: 'not found' });

    const hole = toCamel(rows[0]);
    const { anchors, centerLine } = discretizeHole(hole as never, teeBox);

    const anchorSummary = anchors.map((a: { id: number; position: { lat: number; lng: number }; lie: string; distToPin: number; distFromTee: number; localBearing: number }) => ({
      id: a.id,
      lat: a.position.lat.toFixed(6),
      lng: a.position.lng.toFixed(6),
      lie: a.lie,
      distToPin: Math.round(a.distToPin),
      distFromTee: a.distFromTee,
      localBearing: a.localBearing.toFixed(1),
    }));

    // Count lies
    const lieCounts: Record<string, number> = {};
    for (const a of anchors) {
      lieCounts[(a as { lie: string }).lie] = (lieCounts[(a as { lie: string }).lie] || 0) + 1;
    }

    res.json({
      totalAnchors: anchors.length,
      centerLinePoints: centerLine.length,
      lieCounts,
      anchors: anchorSummary,
    });
  } catch (err) {
    logger.error('Debug anchors failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/debug/tee-actions/:courseId/:holeNumber — tee anchor Q-values for each action
router.get('/tee-actions/:courseId/:holeNumber', async (req, res) => {
  try {
    const holeNumber = parseInt(req.params.holeNumber);
    if (isNaN(holeNumber)) return res.status(400).json({ error: 'Hole number must be a valid number' });

    const { debugTeeActions } = await import('../services/dp-optimizer.js');
    const { buildDistributions } = await import('../services/monte-carlo.js');
    const { computeClubShotGroups } = await import('../services/club-shot-groups.js');

    const courseId = req.params.courseId;
    const teeBox = (req.query.tee as string) || 'blue';
    const topN = parseInt(req.query.top as string) || 20;

    // Load hole
    const { rows: holeRows } = await pool.query(
      'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [courseId, holeNumber],
    );
    if (holeRows.length === 0) return res.json({ error: 'hole not found' });

    const hole = toCamel(holeRows[0]);

    // Load clubs/shots for distributions
    const { rows: clubRows } = await pool.query('SELECT * FROM clubs ORDER BY loft ASC');
    const { rows: shotRows } = await pool.query('SELECT * FROM shots');
    const clubs = clubRows.map(r => toCamel(r));
    const shots = shotRows.map(r => toCamel(r));
    const groups = computeClubShotGroups(clubs as never[], shots as never[]);
    const distributions = buildDistributions(groups);

    const traces = debugTeeActions(hole as never, teeBox, distributions);

    // Return top N by meanQ, plus summary
    const topTraces = traces.slice(0, topN).map((t) => ({
      clubName: t.clubName,
      bearing: t.bearing,
      meanQ: t.meanQ,
      pFairway: t.pFairway,
      pGreen: t.pGreen,
      outcomes: {
        total: t.outcomeSummary.length,
        shortGameCount: t.outcomeSummary.filter((o) => o.usedShortGame).length,
        avgDistToPin: Math.round(t.outcomeSummary.reduce((s, o) => s + o.distToPin, 0) / t.outcomeSummary.length * 10) / 10,
        avgContV: Math.round(t.outcomeSummary.reduce((s, o) => s + o.contV, 0) / t.outcomeSummary.length * 1000) / 1000,
        avgPenalty: Math.round(t.outcomeSummary.reduce((s, o) => s + o.penalty, 0) / t.outcomeSummary.length * 1000) / 1000,
        lieCounts: t.outcomeSummary.reduce((acc, o) => { acc[o.lie] = (acc[o.lie] || 0) + 1; return acc; }, {} as Record<string, number>),
      },
    }));

    res.json({ topActions: topTraces, totalActions: traces.length });
  } catch (err) {
    logger.error('Debug tee-actions failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
