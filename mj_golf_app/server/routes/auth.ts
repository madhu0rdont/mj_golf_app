import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// POST /api/auth/login — username + password
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { rows } = await query(
    'SELECT * FROM users WHERE lower(username) = lower($1)',
    [username],
  );
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.authenticated = true;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session save failed' });
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email || undefined,
        profilePicture: user.profile_picture || undefined,
        role: user.role,
        handedness: user.handedness,
      },
    });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/check — returns user info if authenticated, or needsSetup flag
router.get('/check', async (req, res) => {
  // Check if setup is needed (no users exist)
  const { rows: countRows } = await query('SELECT count(*) FROM users');
  const userCount = parseInt(countRows[0].count);

  if (userCount === 0) {
    return res.json({ authenticated: false, needsSetup: true });
  }

  if (!req.session?.authenticated || !req.session.userId) {
    return res.json({ authenticated: false, needsSetup: false });
  }

  // Fetch fresh user data
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  if (rows.length === 0) {
    return res.json({ authenticated: false, needsSetup: false });
  }

  const user = rows[0];
  res.json({
    authenticated: true,
    needsSetup: false,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email || undefined,
      profilePicture: user.profile_picture || undefined,
      role: user.role,
      handedness: user.handedness,
    },
  });
});

// POST /api/auth/setup — create first accounts (only works when no users exist)
router.post('/setup', async (req, res) => {
  const { rows: countRows } = await query('SELECT count(*) FROM users');
  if (parseInt(countRows[0].count) > 0) {
    return res.status(403).json({ error: 'Setup already completed' });
  }

  const { adminUsername, adminPassword, playerUsername, playerPassword, playerDisplayName } = req.body;

  if (!adminUsername || !adminPassword || !playerUsername || !playerPassword) {
    return res.status(400).json({ error: 'Admin and player credentials are required' });
  }

  const now = Date.now();

  // Create admin account
  const adminId = crypto.randomUUID();
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await query(
    `INSERT INTO users (id, username, password, display_name, role, handedness, created_at, updated_at)
     VALUES ($1, $2, $3, 'Admin', 'admin', 'right', $4, $4)`,
    [adminId, adminUsername.toLowerCase(), adminHash, now],
  );

  // Create player account
  const playerId = crypto.randomUUID();
  const playerHash = await bcrypt.hash(playerPassword, 12);
  await query(
    `INSERT INTO users (id, username, password, display_name, role, handedness, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'player', 'left', $5, $5)`,
    [playerId, playerUsername.toLowerCase(), playerHash, playerDisplayName || playerUsername, now],
  );

  // Assign any existing data to the new player account
  await query('UPDATE clubs SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  await query('UPDATE sessions SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  await query('UPDATE shots SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  await query('UPDATE wedge_overrides SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  await query('UPDATE game_plan_cache SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  await query('UPDATE game_plan_history SET user_id = $1 WHERE user_id IS NULL', [playerId]);

  // Auto-login the player account
  req.session.authenticated = true;
  req.session.userId = playerId;
  req.session.username = playerUsername.toLowerCase();
  req.session.role = 'player';
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session save failed' });
    res.status(201).json({
      success: true,
      user: {
        id: playerId,
        username: playerUsername.toLowerCase(),
        displayName: playerDisplayName || playerUsername,
        role: 'player',
        handedness: 'left',
      },
    });
  });
});

export default router;
