import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

const wedgeOverrideSchema = z.object({
  clubId: z.string().uuid(),
  position: z.string().min(1),
  carry: z.number().positive(),
});

// GET /api/wedge-overrides — user's overrides (from club_distance_profiles)
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { rows } = await query(
      `SELECT cdp.id, cp.bag_club_id AS club_id, cdp.shot_intent AS position, cdp.carry_mean AS carry
       FROM club_distance_profiles cdp
       JOIN club_profiles cp ON cp.id = cdp.club_profile_id
       JOIN bag_clubs bc ON bc.id = cp.bag_club_id
       WHERE bc.user_id = $1`,
      [userId],
    );
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('Failed to list wedge overrides', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/wedge-overrides — upsert one override
router.put('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const parsed = wedgeOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }
    const { clubId, position, carry } = parsed.data;

    // Find or create the manual profile for this club
    const { rows: profileRows } = await query(
      `SELECT cp.id FROM club_profiles cp
       JOIN bag_clubs bc ON bc.id = cp.bag_club_id
       WHERE cp.bag_club_id = $1 AND cp.profile_type = 'manual' AND cp.is_current = true AND bc.user_id = $2`,
      [clubId, userId],
    );

    let profileId: string;
    if (profileRows.length > 0) {
      profileId = profileRows[0].id as string;
    } else {
      // Create a manual profile
      const now = Date.now();
      const { rows: newProfile } = await query(
        `INSERT INTO club_profiles (id, bag_club_id, profile_type, is_current, effective_from, created_at)
         VALUES (gen_random_uuid()::text, $1, 'manual', TRUE, $2, $2)
         RETURNING id`,
        [clubId, now],
      );
      profileId = newProfile[0].id as string;
    }

    await query(
      `INSERT INTO club_distance_profiles (id, club_profile_id, shot_intent, carry_mean, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
       ON CONFLICT (club_profile_id, shot_intent)
       DO UPDATE SET carry_mean = EXCLUDED.carry_mean`,
      [profileId, position, carry, Date.now()],
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to upsert wedge override', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/wedge-overrides/:clubId/:position — remove override
router.delete('/:clubId/:position', async (req, res) => {
  try {
    const userId = req.session.userId!;
    await query(
      `DELETE FROM club_distance_profiles
       WHERE shot_intent = $1
         AND club_profile_id IN (
           SELECT cp.id FROM club_profiles cp
           JOIN bag_clubs bc ON bc.id = cp.bag_club_id
           WHERE cp.bag_club_id = $2 AND bc.user_id = $3
         )`,
      [req.params.position, req.params.clubId, userId],
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to delete wedge override', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
