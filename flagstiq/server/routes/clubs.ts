import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import { pickColumns, buildInsert, BAG_CLUB_COLUMNS } from '../utils/db-columns.js';
import { markPlansStale } from './game-plans.js';
import { loadUserClubs, loadSingleClub } from '../services/club-loader.js';

const createClubSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  loft: z.number().optional(),
  carryYards: z.number().optional(),
  totalYards: z.number().optional(),
  shaftFlex: z.string().optional(),
});

const updateClubSchema = createClubSchema.partial();

const router = Router();

// GET /api/clubs — list user's clubs ordered by sort_order
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const clubs = await loadUserClubs(userId);
    res.json(clubs);
  } catch (err) {
    logger.error('Failed to list clubs', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clubs/:id — single club (owned by user)
router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const club = await loadSingleClub(userId, req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    res.json(club);
  } catch (err) {
    logger.error('Failed to get club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clubs — create club
router.post('/', async (req, res) => {
  try {
    const parsed = createClubSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }

    const userId = req.session.userId!;
    const now = Date.now();
    const id = crypto.randomUUID();

    // Get max sort_order for this user
    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM bag_clubs WHERE user_id = $1',
      [userId],
    );
    const sortOrder = maxRows[0].max_order + 1;

    const filtered = pickColumns({ ...req.body, id, userId, sortOrder, isActive: true, createdAt: now, updatedAt: now }, BAG_CLUB_COLUMNS);
    const q = buildInsert('bag_clubs', filtered);
    await query(q.text, q.values);

    // Create club_profiles if carry/total distances provided
    const { carryYards, totalYards } = req.body;
    if (carryYards != null || totalYards != null) {
      await query(
        `INSERT INTO club_profiles (id, bag_club_id, profile_type, carry_mean, total_mean, is_current, effective_from, created_at)
         VALUES (gen_random_uuid()::text, $1, 'manual', $2, $3, TRUE, $4, $4)`,
        [id, carryYards ?? null, totalYards ?? null, now],
      );
    }

    const club = await loadSingleClub(userId, id);
    res.status(201).json(club);

    // Fire-and-forget: mark game plans stale for this user
    markPlansStale('Club bag changed', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));
  } catch (err) {
    logger.error('Failed to create club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clubs/reorder — batch update sort_order
router.put('/reorder', async (req, res) => {
  try {
    const orderedIds = req.body.orderedIds;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    const userId = req.session.userId!;
    const now = Date.now();

    await withTransaction(async (client) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE bag_clubs SET sort_order = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
          [i, now, orderedIds[i], userId]
        );
      }
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to reorder clubs', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clubs/:id — update club
router.put('/:id', async (req, res) => {
  try {
    const parsed = updateClubSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }

    const userId = req.session.userId!;
    const now = Date.now();

    // Separate physical fields (bag_clubs) from distance fields (club_profiles)
    const physicalFiltered = pickColumns({ ...req.body, updatedAt: now }, BAG_CLUB_COLUMNS);
    delete physicalFiltered.user_id;
    const physKeys = Object.keys(physicalFiltered);
    const physValues = Object.values(physicalFiltered);

    const { carryYards, totalYards } = req.body;
    const hasDistanceUpdate = carryYards !== undefined || totalYards !== undefined;

    if (physKeys.length === 0 && !hasDistanceUpdate) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Update bag_clubs physical fields
    if (physKeys.length > 0) {
      const setClauses = physKeys.map((k, i) => `${k} = $${i + 1}`);
      physValues.push(req.params.id, userId);
      await query(
        `UPDATE bag_clubs SET ${setClauses.join(', ')} WHERE id = $${physValues.length - 1} AND user_id = $${physValues.length}`,
        physValues,
      );
    }

    // Upsert manual profile for distance fields
    if (hasDistanceUpdate) {
      const { rows: existing } = await query(
        "SELECT id FROM club_profiles WHERE bag_club_id = $1 AND profile_type = 'manual' AND is_current = true",
        [req.params.id],
      );
      if (existing.length > 0) {
        const sets: string[] = [];
        const vals: unknown[] = [];
        if (carryYards !== undefined) { vals.push(carryYards); sets.push(`carry_mean = $${vals.length}`); }
        if (totalYards !== undefined) { vals.push(totalYards); sets.push(`total_mean = $${vals.length}`); }
        vals.push(existing[0].id);
        await query(`UPDATE club_profiles SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      } else {
        await query(
          `INSERT INTO club_profiles (id, bag_club_id, profile_type, carry_mean, total_mean, is_current, effective_from, created_at)
           VALUES (gen_random_uuid()::text, $1, 'manual', $2, $3, TRUE, $4, $4)`,
          [req.params.id, carryYards ?? null, totalYards ?? null, now],
        );
      }
    }

    const club = await loadSingleClub(userId, req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    res.json(club);

    // Fire-and-forget: mark game plans stale for this user
    markPlansStale('Club settings changed', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));
  } catch (err) {
    logger.error('Failed to update club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clubs/:id — delete club (cascade sessions+shots, profiles cascade via ON DELETE CASCADE)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    await withTransaction(async (client) => {
      // Delete sessions (shots cascade via ON DELETE CASCADE on shots.session_id)
      await client.query('DELETE FROM sessions WHERE club_id = $1 AND user_id = $2', [req.params.id, userId]);
      // bag_clubs cascade deletes club_profiles → club_distance_profiles
      await client.query('DELETE FROM bag_clubs WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    });

    res.json({ ok: true });

    // Fire-and-forget: mark game plans stale for this user
    markPlansStale('Club removed', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));
  } catch (err) {
    logger.error('Failed to delete club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
