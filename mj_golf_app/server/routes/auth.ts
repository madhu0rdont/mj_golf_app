import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { logger } from '../logger.js';
import { isValidEmail, isValidPassword } from '../utils/validation.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' },
});

// POST /api/auth/login — email or username + password
router.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/username and password are required' });
  }

  const { rows } = await query(
    'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
    [identifier],
  );
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check user status
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Account pending approval' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Account has been rejected' });
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
        status: user.status,
        homeCourseId: user.home_course_id || undefined,
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
      status: user.status,
      homeCourseId: user.home_course_id || undefined,
    },
  });
});

// POST /api/auth/forgot-password — request password reset email
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Always return 200 to prevent email enumeration
  const successMsg = { message: 'If an account exists with that email, a reset link has been sent.' };

  const { rows } = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (rows.length === 0) {
    return res.json(successMsg);
  }

  const userId = rows[0].id;

  // Generate token
  const tokenBytes = crypto.randomBytes(32);
  const tokenHex = tokenBytes.toString('hex');
  const tokenHash = crypto.createHash('sha256').update(tokenBytes).digest('hex');

  // Delete existing unused tokens for this user
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = FALSE', [userId]);

  // Insert new token with 1-hour expiry
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [userId, tokenHash],
  );

  const appUrl = process.env.APP_URL || 'https://mjgolf.up.railway.app';
  const resetUrl = `${appUrl}/reset-password?token=${tokenHex}`;

  sendPasswordResetEmail(email, resetUrl).catch((err) => {
    logger.error('Failed to send password reset email', { error: String(err) });
  });

  res.json(successMsg);
});

// POST /api/auth/reset-password — set new password using reset token
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const tokenHash = crypto.createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');

  const { rows } = await query(
    `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()`,
    [tokenHash],
  );

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  const { id: tokenId, user_id: userId } = rows[0];

  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password = $1, updated_at = $2 WHERE id = $3', [hash, Date.now(), userId]);
  await query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [tokenId]);

  logger.info(`Password reset completed for user ${userId}`);
  res.json({ message: 'Password updated successfully' });
});

// POST /api/auth/register — create a new account (pending admin approval)
router.post('/register', registerLimiter, async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 3-30 characters' });
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, dashes, and underscores' });
  }

  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 12);
  const now = Date.now();

  try {
    await query(
      `INSERT INTO users (id, username, password, display_name, email, role, handedness, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'player', 'right', 'pending', $6, $6)`,
      [id, username.toLowerCase(), hash, displayName || username, email.toLowerCase(), now],
    );
  } catch (err: any) {
    if (err.code === '23505') {
      const detail = String(err.detail || '');
      if (detail.includes('username')) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      if (detail.includes('email')) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      return res.status(409).json({ error: 'Account already exists' });
    }
    throw err;
  }

  sendWelcomeEmail(email, displayName || username).catch((err) => {
    logger.error('Failed to send welcome email', { error: String(err) });
  });

  logger.info(`New account registered: ${username} (pending approval)`);
  res.status(201).json({ message: 'Account created. Pending admin approval.' });
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
