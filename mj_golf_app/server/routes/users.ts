import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/users — list all users (admin only)
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, username, display_name, role, handedness, created_at, updated_at FROM users ORDER BY created_at',
    );
    res.json(rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      handedness: r.handedness,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    logger.error('Failed to list users', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName, role, handedness } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (role && !['admin', 'player'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or player' });
    }
    if (handedness && !['left', 'right'].includes(handedness)) {
      return res.status(400).json({ error: 'Handedness must be left or right' });
    }

    // Check for duplicate username
    const { rows: existing } = await query(
      'SELECT id FROM users WHERE lower(username) = lower($1)',
      [username],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    const now = Date.now();

    await query(
      `INSERT INTO users (id, username, password, display_name, role, handedness, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [id, username.toLowerCase(), hash, displayName || username, role || 'player', handedness || 'right', now],
    );

    res.status(201).json({
      id,
      username: username.toLowerCase(),
      displayName: displayName || username,
      role: role || 'player',
      handedness: handedness || 'right',
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    logger.error('Failed to create user', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/me — update own profile (any authenticated user)
router.put('/me', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { displayName, handedness, password } = req.body;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (displayName !== undefined) {
      values.push(displayName);
      sets.push(`display_name = $${values.length}`);
    }
    if (handedness !== undefined) {
      if (!['left', 'right'].includes(handedness)) {
        return res.status(400).json({ error: 'Handedness must be left or right' });
      }
      values.push(handedness);
      sets.push(`handedness = $${values.length}`);
    }
    if (password !== undefined) {
      const hash = await bcrypt.hash(password, 12);
      values.push(hash);
      sets.push(`password = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(Date.now());
    sets.push(`updated_at = $${values.length}`);
    values.push(userId);

    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

    const { rows } = await query(
      'SELECT id, username, display_name, role, handedness FROM users WHERE id = $1',
      [userId],
    );
    res.json({
      id: rows[0].id,
      username: rows[0].username,
      displayName: rows[0].display_name,
      role: rows[0].role,
      handedness: rows[0].handedness,
    });
  } catch (err) {
    logger.error('Failed to update user profile', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — delete user + cascade their data (admin only, cannot delete self)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.session.userId!;

    if (targetId === currentUserId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Verify user exists
    const { rows } = await query('SELECT id FROM users WHERE id = $1', [targetId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await withTransaction(async (client) => {
      // Cascade delete user's data
      await client.query('DELETE FROM shots WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM wedge_overrides WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM game_plan_cache WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM game_plan_history WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM clubs WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM users WHERE id = $1', [targetId]);
    });

    logger.info(`Deleted user ${targetId} and all associated data`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to delete user', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
