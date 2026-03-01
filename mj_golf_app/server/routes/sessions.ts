import { Router } from 'express';
import { query, toCamel, withTransaction } from '../db.js';
import { pickColumns, buildInsert, SESSION_COLUMNS, SHOT_COLUMNS } from '../utils/db-columns.js';
import { classifyAllShots } from '../services/shot-classifier.js';
import { markPlansStale } from './game-plans.js';

const router = Router();

// GET /api/sessions — list sessions with optional filters
// ?clubId=xxx — sessions for a specific club
// ?limit=10 — recent sessions (default: no limit)
// ?all=true — all sessions sorted by date desc
router.get('/', async (req, res) => {
  try {
    const { clubId, limit, all } = req.query;

    let sql = 'SELECT * FROM sessions';
    const params: unknown[] = [];

    if (clubId) {
      params.push(clubId);
      sql += ` WHERE club_id = $${params.length}`;
    }

    sql += ' ORDER BY date DESC';

    if (limit && !all) {
      const parsed = parseInt(limit as string);
      if (isNaN(parsed)) {
        return res.status(400).json({ error: 'limit must be a number' });
      }
      params.push(parsed);
      sql += ` LIMIT $${params.length}`;
    }

    const { rows } = await query(sql, params);
    res.json(rows.map(toCamel));
  } catch (err) {
    console.error('Failed to list sessions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/:id — single session
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json(toCamel(rows[0]));
  } catch (err) {
    console.error('Failed to get session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions — create session with shots
// Body: { clubId?, type?, date, location?, notes?, source, shots: [...] }
router.post('/', async (req, res) => {
  try {
    const { clubId, type = 'block', date, location, notes, source, metadata, shots: rawShots } = req.body;

    const VALID_TYPES = ['block', 'wedge-distance', 'interleaved'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid session type: ${type}` });
    }
    if (!Array.isArray(rawShots) || rawShots.length === 0) {
      return res.status(400).json({ error: 'Sessions must include at least one shot' });
    }

    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const isMultiClub = type === 'wedge-distance' || type === 'interleaved';

    if (isMultiClub) {
      const missing = rawShots.some((s: Record<string, unknown>) => !s.clubId);
      if (missing) {
        return res.status(400).json({ error: 'All shots in multi-club sessions must have a clubId' });
      }
    }

    // Build shot objects
    const shotsWithIds = rawShots.map((s: Record<string, unknown>, i: number) => ({
      ...s,
      id: crypto.randomUUID(),
      sessionId,
      carryYards: s.carryYards as number,
      clubId: isMultiClub ? s.clubId : clubId,
      position: s.position || null,
      holeNumber: s.holeNumber ?? null,
      shotNumber: s.shotNumber ?? i + 1,
      timestamp: now,
    }));

    // Classify shots (left-handed)
    // For multi-club sessions, classify per-club group so quality is relative to each club
    let classifiedShots;
    if (isMultiClub) {
      const byClub = new Map<string, typeof shotsWithIds>();
      for (const shot of shotsWithIds) {
        const list = byClub.get(shot.clubId as string) || [];
        list.push(shot);
        byClub.set(shot.clubId as string, list);
      }
      classifiedShots = [];
      for (const group of byClub.values()) {
        classifiedShots.push(...classifyAllShots(group, 'left'));
      }
    } else {
      classifiedShots = classifyAllShots(shotsWithIds, 'left');
    }

    const session = {
      id: sessionId,
      clubId: isMultiClub ? null : clubId,
      type,
      date,
      location: location || null,
      notes: notes || null,
      source,
      shotCount: classifiedShots.length,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: now,
      updatedAt: now,
    };

    await withTransaction(async (client) => {
      // Insert session
      const sessionRow = pickColumns(session, SESSION_COLUMNS);
      const sq = buildInsert('sessions', sessionRow);
      await client.query(sq.text, sq.values);

      // Insert shots
      for (const shot of classifiedShots) {
        const shotRow = pickColumns(shot, SHOT_COLUMNS);
        const shq = buildInsert('shots', shotRow);
        await client.query(shq.text, shq.values);
      }
    });

    await markPlansStale('New practice data recorded');
    res.status(201).json(session);
  } catch (err) {
    console.error('Failed to create session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/sessions/:id — update session
router.put('/:id', async (req, res) => {
  try {
    const { clubId, date } = req.body;
    const now = Date.now();

    await withTransaction(async (client) => {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (clubId !== undefined) {
        values.push(clubId);
        updates.push(`club_id = $${values.length}`);
      }
      if (date !== undefined) {
        values.push(date);
        updates.push(`date = $${values.length}`);
      }
      values.push(now);
      updates.push(`updated_at = $${values.length}`);
      values.push(req.params.id);

      await client.query(
        `UPDATE sessions SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
      );

      // If clubId changed, update shots too
      if (clubId !== undefined) {
        await client.query(
          'UPDATE shots SET club_id = $1 WHERE session_id = $2',
          [clubId, req.params.id]
        );
      }
    });

    const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    res.json(toCamel(rows[0]));
  } catch (err) {
    console.error('Failed to update session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/:id/shots — shots for a session
router.get('/:id/shots', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM shots WHERE session_id = $1 ORDER BY shot_number',
      [req.params.id]
    );
    res.json(rows.map(toCamel));
  } catch (err) {
    console.error('Failed to get session shots:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/sessions/:id — delete session (shots cascade)
router.delete('/:id', async (_req, res) => {
  try {
    await query('DELETE FROM sessions WHERE id = $1', [_req.params.id]);
    await markPlansStale('Practice data deleted');
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
