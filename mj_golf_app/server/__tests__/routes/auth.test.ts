import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Must set env before module loads (hoisted runs first)
vi.hoisted(() => {
  process.env.APP_PASSWORD = 'test-password';
});

// Mock bcrypt before importing auth router
const mockCompare = vi.fn().mockResolvedValue(false);
vi.mock('bcrypt', () => ({
  default: {
    hashSync: () => '$2b$10$fakehash',
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}));

// Mock express-rate-limit to be a passthrough
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import authRouter from '../../routes/auth.js';

function createAuthApp() {
  const app = express();
  app.use(express.json());
  // Minimal session mock — must be set before routes run
  app.use((req: any, _res: any, next: () => void) => {
    req.session = {
      authenticated: false,
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

describe('auth routes', () => {
  beforeEach(() => {
    mockCompare.mockReset().mockResolvedValue(false);
  });

  // ── POST /login ──────────────────────────────────────────────────
  describe('POST /login', () => {
    it('returns success on correct password', async () => {
      mockCompare.mockResolvedValueOnce(true);

      const res = await request(app)
        .post('/login')
        .send({ password: 'test-password' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockCompare).toHaveBeenCalledWith('test-password', '$2b$10$fakehash');
    });

    it('returns 401 on wrong password', async () => {
      mockCompare.mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/login')
        .send({ password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Wrong password' });
    });

    it('returns 401 when password is missing', async () => {
      mockCompare.mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/login')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Wrong password' });
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
    it('returns authenticated status', async () => {
      const res = await request(app).get('/check');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('authenticated');
    });
  });
});
