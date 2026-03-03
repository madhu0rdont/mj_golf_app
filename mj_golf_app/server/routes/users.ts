import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/users — list all users (admin only)
// Excludes profile_picture blob to keep response small; use GET /api/users/:id/picture instead
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, username, display_name, email, (profile_picture IS NOT NULL) AS has_picture, role, handedness, created_at, updated_at FROM users ORDER BY created_at',
    );
    res.json(rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      email: r.email || undefined,
      hasProfilePicture: r.has_picture,
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

// GET /api/users/:id/picture — get profile picture for a single user
router.get('/:id/picture', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT profile_picture FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ profilePicture: rows[0].profile_picture || null });
  } catch (err) {
    logger.error('Failed to get user picture', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName, email, role, handedness } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (role && !['admin', 'player'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or player' });
    }
    if (handedness && !['left', 'right'].includes(handedness)) {
      return res.status(400).json({ error: 'Handedness must be left or right' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check for duplicate username
    const { rows: existing } = await query(
      'SELECT id FROM users WHERE lower(username) = lower($1)',
      [username],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Check for duplicate email
    if (email) {
      const { rows: emailExisting } = await query(
        'SELECT id FROM users WHERE lower(email) = lower($1)',
        [email],
      );
      if (emailExisting.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    const now = Date.now();

    await query(
      `INSERT INTO users (id, username, password, display_name, email, role, handedness, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [id, username.toLowerCase(), hash, displayName || username, email?.toLowerCase() || null, role || 'player', handedness || 'right', now],
    );

    res.status(201).json({
      id,
      username: username.toLowerCase(),
      displayName: displayName || username,
      email: email?.toLowerCase() || undefined,
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
    const { displayName, handedness, password, email, profilePicture } = req.body;

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
    if (email !== undefined) {
      if (email === null || email === '') {
        values.push(null);
        sets.push(`email = $${values.length}`);
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
        // Check uniqueness (exclude current user)
        const { rows: emailExisting } = await query(
          'SELECT id FROM users WHERE lower(email) = lower($1) AND id != $2',
          [email, userId],
        );
        if (emailExisting.length > 0) {
          return res.status(409).json({ error: 'Email already in use' });
        }
        values.push(email.toLowerCase());
        sets.push(`email = $${values.length}`);
      }
    }
    if (profilePicture !== undefined) {
      if (profilePicture === null) {
        values.push(null);
        sets.push(`profile_picture = $${values.length}`);
      } else {
        if (typeof profilePicture !== 'string' || !profilePicture.startsWith('data:image/')) {
          return res.status(400).json({ error: 'Profile picture must be a data:image URL' });
        }
        if (profilePicture.length > 200_000) {
          return res.status(400).json({ error: 'Profile picture too large (max ~150KB)' });
        }
        values.push(profilePicture);
        sets.push(`profile_picture = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(Date.now());
    sets.push(`updated_at = $${values.length}`);
    values.push(userId);

    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

    const { rows } = await query(
      'SELECT id, username, display_name, email, profile_picture, role, handedness FROM users WHERE id = $1',
      [userId],
    );
    res.json({
      id: rows[0].id,
      username: rows[0].username,
      displayName: rows[0].display_name,
      email: rows[0].email || undefined,
      profilePicture: rows[0].profile_picture || undefined,
      role: rows[0].role,
      handedness: rows[0].handedness,
    });
  } catch (err) {
    logger.error('Failed to update user profile', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id — edit any user (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.session.userId!;
    const { displayName, email, role, handedness, password } = req.body;

    // Verify user exists
    const { rows: existing } = await query('SELECT id, role FROM users WHERE id = $1', [targetId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent admin from changing their own role
    if (targetId === currentUserId && role && role !== existing[0].role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const sets: string[] = [];
    const values: unknown[] = [];

    if (displayName !== undefined) {
      values.push(displayName);
      sets.push(`display_name = $${values.length}`);
    }
    if (role !== undefined) {
      if (!['admin', 'player'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or player' });
      }
      values.push(role);
      sets.push(`role = $${values.length}`);
    }
    if (handedness !== undefined) {
      if (!['left', 'right'].includes(handedness)) {
        return res.status(400).json({ error: 'Handedness must be left or right' });
      }
      values.push(handedness);
      sets.push(`handedness = $${values.length}`);
    }
    if (email !== undefined) {
      if (email === null || email === '') {
        values.push(null);
        sets.push(`email = $${values.length}`);
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
        const { rows: emailExisting } = await query(
          'SELECT id FROM users WHERE lower(email) = lower($1) AND id != $2',
          [email, targetId],
        );
        if (emailExisting.length > 0) {
          return res.status(409).json({ error: 'Email already in use' });
        }
        values.push(email.toLowerCase());
        sets.push(`email = $${values.length}`);
      }
    }
    if (password !== undefined && password !== '') {
      const hash = await bcrypt.hash(password, 12);
      values.push(hash);
      sets.push(`password = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(Date.now());
    sets.push(`updated_at = $${values.length}`);
    values.push(targetId);

    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

    const { rows } = await query(
      'SELECT id, username, display_name, email, profile_picture, role, handedness, created_at, updated_at FROM users WHERE id = $1',
      [targetId],
    );
    res.json({
      id: rows[0].id,
      username: rows[0].username,
      displayName: rows[0].display_name,
      email: rows[0].email || undefined,
      profilePicture: rows[0].profile_picture || undefined,
      role: rows[0].role,
      handedness: rows[0].handedness,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    });
  } catch (err) {
    logger.error('Failed to update user', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/clear-data — clear a user's practice data but keep account (admin only)
router.post('/:id/clear-data', requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;

    // Verify user exists
    const { rows } = await query('SELECT id, role FROM users WHERE id = $1', [targetId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts have no player data to clear' });
    }

    await withTransaction(async (client) => {
      await client.query('DELETE FROM shots WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM wedge_overrides WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM game_plan_cache WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM game_plan_history WHERE user_id = $1', [targetId]);
      await client.query('DELETE FROM clubs WHERE user_id = $1', [targetId]);
    });

    logger.info(`Cleared all data for user ${targetId}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to clear user data', { error: String(err) });
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
