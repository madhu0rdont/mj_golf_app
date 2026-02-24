import { Router } from 'express';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return res.status(500).json({ error: 'APP_PASSWORD not configured' });
  }

  if (password === appPassword) {
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
