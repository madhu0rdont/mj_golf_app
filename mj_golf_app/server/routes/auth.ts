import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';

const router = Router();

// Hash the app password at startup (lives in memory only)
const appPassword = process.env.APP_PASSWORD;
const passwordHash = appPassword ? bcrypt.hashSync(appPassword, 10) : null;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;

  if (!passwordHash) {
    return res.status(500).json({ error: 'APP_PASSWORD not configured' });
  }

  const match = await bcrypt.compare(password || '', passwordHash);
  if (match) {
    req.session.authenticated = true;
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session save failed' });
      }
      res.json({ success: true });
    });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
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

// GET /api/auth/check
router.get('/check', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

export default router;
