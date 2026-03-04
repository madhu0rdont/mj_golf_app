import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock bcrypt
const mockCompare = vi.fn().mockResolvedValue(false);
const mockHash = vi.fn().mockResolvedValue('$2b$12$hashedpassword');
vi.mock('bcrypt', () => ({
  default: {
    compare: (...args: unknown[]) => mockCompare(...args),
    hash: (...args: unknown[]) => mockHash(...args),
  },
}));

// Mock express-rate-limit to be a passthrough
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock db query
const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('../../db.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock email service
vi.mock('../../services/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import authRouter from '../../routes/auth.js';

function createAuthApp() {
  const app = express();
  app.use(express.json());
  // Minimal session mock
  app.use((req: any, _res: any, next: () => void) => {
    req.session = {
      authenticated: false,
      userId: undefined,
      username: undefined,
      role: undefined,
      save(cb: (err?: Error) => void) { cb(); },
      destroy(cb: (err?: Error) => void) {
        req.session = null;
        cb();
      },
    };
    next();
  });
  app.use('/', authRouter);
  return app;
}

const app = createAuthApp();

const testUser = {
  id: 'user-1',
  username: 'mj',
  password: '$2b$12$hashedpassword',
  display_name: 'MJ',
  email: 'mj@example.com',
  role: 'player',
  handedness: 'left',
  status: 'active',
};

describe('auth routes', () => {
  beforeEach(() => {
    mockCompare.mockReset().mockResolvedValue(false);
    mockHash.mockReset().mockResolvedValue('$2b$12$hashedpassword');
    mockQuery.mockReset().mockResolvedValue({ rows: [] });
  });

  // ── POST /login ──────────────────────────────────────────────────
  describe('POST /login', () => {
    it('returns success with user info on correct credentials', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [testUser] }); // user lookup
      mockCompare.mockResolvedValueOnce(true);

      const res = await request(app)
        .post('/login')
        .send({ identifier: 'mj', password: 'correct' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toMatchObject({
        id: 'user-1',
        username: 'mj',
        displayName: 'MJ',
        role: 'player',
        handedness: 'left',
        status: 'active',
      });
    });

    it('returns 401 on wrong password', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [testUser] }); // user lookup
      mockCompare.mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/login')
        .send({ identifier: 'mj', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 401 when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no user

      const res = await request(app)
        .post('/login')
        .send({ identifier: 'nobody', password: 'test' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 400 when identifier or password missing', async () => {
      const res = await request(app)
        .post('/login')
        .send({ identifier: 'mj' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email/username and password are required');
    });

    it('returns 403 when user is pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...testUser, status: 'pending' }] });
      mockCompare.mockResolvedValueOnce(true);

      const res = await request(app)
        .post('/login')
        .send({ identifier: 'mj', password: 'correct' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Account pending approval');
    });

    it('returns 403 when user is rejected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...testUser, status: 'rejected' }] });
      mockCompare.mockResolvedValueOnce(true);

      const res = await request(app)
        .post('/login')
        .send({ identifier: 'mj', password: 'correct' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Account has been rejected');
    });

    it('supports login by email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [testUser] });
      mockCompare.mockResolvedValueOnce(true);

      const res = await request(app)
        .post('/login')
        .send({ identifier: 'mj@example.com', password: 'correct' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /logout ─────────────────────────────────────────────────
  describe('POST /logout', () => {
    it('returns success on logout', async () => {
      const res = await request(app).post('/logout');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  // ── GET /check ───────────────────────────────────────────────────
  describe('GET /check', () => {
    it('returns needsSetup when no users exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }); // user count

      const res = await request(app).get('/check');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.needsSetup).toBe(true);
    });

    it('returns not authenticated when session has no userId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }); // users exist

      const res = await request(app).get('/check');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });
  });

  // ── POST /setup ──────────────────────────────────────────────────
  describe('POST /setup', () => {
    it('returns 403 when users already exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app)
        .post('/setup')
        .send({
          adminUsername: 'admin',
          adminPassword: 'pass',
          playerUsername: 'mj',
          playerPassword: 'pass',
        });

      expect(res.status).toBe(403);
    });

    it('creates admin and player accounts when no users exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // count check
        .mockResolvedValueOnce({ rows: [] }) // admin insert
        .mockResolvedValueOnce({ rows: [] }) // player insert
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // assign clubs
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // assign sessions
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // assign shots
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // assign wedge_overrides
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // assign game_plan_cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // assign game_plan_history

      const res = await request(app)
        .post('/setup')
        .send({
          adminUsername: 'admin',
          adminPassword: 'adminpass',
          playerUsername: 'mj',
          playerPassword: 'mjpass',
          playerDisplayName: 'MJ',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('player');
    });
  });

  // ── POST /forgot-password ────────────────────────────────────────
  describe('POST /forgot-password', () => {
    it('returns 200 even when email not found (no enumeration)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no user

      const res = await request(app)
        .post('/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('If an account exists');
    });

    it('returns 400 on invalid email', async () => {
      const res = await request(app)
        .post('/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /reset-password ─────────────────────────────────────────
  describe('POST /reset-password', () => {
    it('returns 400 when token not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no token

      const res = await request(app)
        .post('/reset-password')
        .send({ token: 'a'.repeat(64), password: 'newpassword123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid or expired reset link');
    });

    it('returns 400 when password too short', async () => {
      const res = await request(app)
        .post('/reset-password')
        .send({ token: 'a'.repeat(64), password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Password must be at least 8 characters');
    });
  });

  // ── POST /register ───────────────────────────────────────────────
  describe('POST /register', () => {
    it('creates a pending user on valid input', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // insert succeeds

      const res = await request(app)
        .post('/register')
        .send({
          username: 'newuser',
          email: 'new@example.com',
          password: 'password123',
          displayName: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Pending');
    });

    it('returns 400 on missing fields', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'newuser' });

      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate username', async () => {
      mockQuery.mockRejectedValueOnce({ code: '23505', detail: 'Key (username)=(newuser)' });

      const res = await request(app)
        .post('/register')
        .send({
          username: 'newuser',
          email: 'new@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Username');
    });

    it('returns 400 on short password', async () => {
      const res = await request(app)
        .post('/register')
        .send({
          username: 'newuser',
          email: 'new@example.com',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8 characters');
    });
  });
});
