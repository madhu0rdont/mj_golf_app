import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, mockQuery, mockClient, mockDbModule, resetMocks, mockWithTransaction, TEST_USER_ID } from '../helpers/setup.js';

mockDbModule();

import usersRouter from '../../routes/users.js';

// Admin app for admin-only endpoints, player app for /me
const adminApp = createTestApp(usersRouter, '/', { role: 'admin' });
const playerApp = createTestApp(usersRouter);

describe('users routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── GET / (admin only) ─────────────────────────────────────────────
  describe('GET /', () => {
    it('returns user list with camelCase keys', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'u1', username: 'admin', display_name: 'Admin', email: null, has_picture: false, role: 'admin', handedness: 'right', created_at: 1000, updated_at: 1000 },
          { id: 'u2', username: 'mj', display_name: 'MJ', email: 'mj@test.com', has_picture: true, role: 'player', handedness: 'left', created_at: 2000, updated_at: 2000 },
        ],
      });

      const res = await request(adminApp).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].username).toBe('admin');
      expect(res.body[1].displayName).toBe('MJ');
      expect(res.body[1].email).toBe('mj@test.com');
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(playerApp).get('/');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /:id/picture (admin only) ──────────────────────────────────
  describe('GET /:id/picture', () => {
    it('returns profile picture', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ profile_picture: 'data:image/png;base64,abc' }],
      });

      const res = await request(adminApp).get('/u2/picture');
      expect(res.status).toBe(200);
      expect(res.body.profilePicture).toBe('data:image/png;base64,abc');
    });

    it('returns null when no picture', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ profile_picture: null }],
      });

      const res = await request(adminApp).get('/u2/picture');
      expect(res.status).toBe(200);
      expect(res.body.profilePicture).toBeNull();
    });

    it('returns 404 for nonexistent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(adminApp).get('/nonexistent/picture');
      expect(res.status).toBe(404);
    });
  });

  // ── POST / (create user, admin only) ───────────────────────────────
  describe('POST /', () => {
    it('creates user with valid data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT

      const res = await request(adminApp)
        .post('/')
        .send({ username: 'NewUser', password: 'Secret123', email: 'new@test.com' });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe('newuser'); // lowercased
      expect(res.body.email).toBe('new@test.com');
      expect(res.body.role).toBe('player'); // default
      expect(res.body.handedness).toBe('right'); // default
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 when username missing', async () => {
      const res = await request(adminApp)
        .post('/')
        .send({ password: 'Secret123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username and password are required');
    });

    it('returns 400 when password missing', async () => {
      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username and password are required');
    });

    it('returns 400 for invalid role', async () => {
      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123', role: 'superadmin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Role must be admin or player');
    });

    it('returns 400 for invalid handedness', async () => {
      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123', handedness: 'ambidextrous' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Handedness must be left or right');
    });

    // ── Email validation ──────────────────────────────────────────
    it('returns 400 for invalid email', async () => {
      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123', email: 'notanemail' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid email format');
    });

    it('rejects email with single-char TLD', async () => {
      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123', email: 'user@example.c' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid email format');
    });

    it('accepts valid email with 2-char TLD', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT

      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123', email: 'user@example.co' });

      expect(res.status).toBe(201);
    });

    // ── Duplicate handling (23505) ────────────────────────────────
    it('returns 409 on duplicate username (DB constraint)', async () => {
      const dbError = new Error('duplicate key') as any;
      dbError.code = '23505';
      dbError.detail = 'Key (username)=(newuser) already exists.';
      mockQuery.mockRejectedValueOnce(dbError);

      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Username already exists');
    });

    it('returns 409 on duplicate email (DB constraint)', async () => {
      const dbError = new Error('duplicate key') as any;
      dbError.code = '23505';
      dbError.detail = 'Key (email)=(test@example.com) already exists.';
      mockQuery.mockRejectedValueOnce(dbError);

      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123', email: 'test@example.com' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already in use');
    });

    it('returns 409 with generic message on unknown duplicate', async () => {
      const dbError = new Error('duplicate key') as any;
      dbError.code = '23505';
      dbError.detail = '';
      mockQuery.mockRejectedValueOnce(dbError);

      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Duplicate entry');
    });

    it('returns 500 on non-duplicate DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));

      const res = await request(adminApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(playerApp)
        .post('/')
        .send({ username: 'newuser', password: 'Secret123' });

      expect(res.status).toBe(403);
    });
  });

  // ── PUT /me (update own profile) ───────────────────────────────────
  describe('PUT /me', () => {
    it('updates display name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{ id: TEST_USER_ID, username: 'testuser', display_name: 'New Name', email: null, profile_picture: null, role: 'player', handedness: 'left' }],
        }); // SELECT

      const res = await request(playerApp)
        .put('/me')
        .send({ displayName: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('New Name');
    });

    it('returns 400 when no fields provided', async () => {
      const res = await request(playerApp)
        .put('/me')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No fields to update');
    });

    it('returns 400 for invalid handedness', async () => {
      const res = await request(playerApp)
        .put('/me')
        .send({ handedness: 'both' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Handedness must be left or right');
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(playerApp)
        .put('/me')
        .send({ email: 'bad-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid email format');
    });

    it('allows clearing email with null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{ id: TEST_USER_ID, username: 'testuser', display_name: 'Test', email: null, profile_picture: null, role: 'player', handedness: 'right' }],
        });

      const res = await request(playerApp)
        .put('/me')
        .send({ email: null });

      expect(res.status).toBe(200);
    });

    it('returns 409 when email already in use', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'other-user' }], // email uniqueness check returns a match
      });

      const res = await request(playerApp)
        .put('/me')
        .send({ email: 'taken@test.com' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already in use');
    });

    it('returns 400 for invalid profile picture format', async () => {
      const res = await request(playerApp)
        .put('/me')
        .send({ profilePicture: 'not-a-data-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Profile picture must be a valid base64 data:image URL (jpeg, png, gif, or webp)');
    });

    it('returns 400 for oversized profile picture', async () => {
      const res = await request(playerApp)
        .put('/me')
        .send({ profilePicture: 'data:image/png;base64,' + 'A'.repeat(200_001) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('too large');
    });
  });

  // ── PUT /:id (admin edit user) ─────────────────────────────────────
  describe('PUT /:id', () => {
    it('updates another user', async () => {
      // First query: SELECT to verify user exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'target-id', role: 'player' }] });
      // Second query: UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Third query: SELECT updated user
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'target-id', username: 'mj', display_name: 'Updated', email: null, profile_picture: null, role: 'player', handedness: 'left', created_at: 1000, updated_at: 2000 }],
      });

      const res = await request(adminApp)
        .put('/target-id')
        .send({ displayName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Updated');
    });

    it('returns 404 for nonexistent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(adminApp)
        .put('/nonexistent')
        .send({ displayName: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('prevents admin from changing own role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID, role: 'admin' }] });

      const res = await request(adminApp)
        .put(`/${TEST_USER_ID}`)
        .send({ role: 'player' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot change your own role');
    });

    it('returns 400 for invalid role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'target-id', role: 'player' }] });

      const res = await request(adminApp)
        .put('/target-id')
        .send({ role: 'superadmin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Role must be admin or player');
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(playerApp)
        .put('/some-id')
        .send({ displayName: 'Updated' });

      expect(res.status).toBe(403);
    });
  });

  // ── POST /:id/clear-data (admin only) ──────────────────────────────
  describe('POST /:id/clear-data', () => {
    it('clears player data in transaction', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-id', role: 'player' }] });

      const res = await request(adminApp).post('/player-id/clear-data');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM shots WHERE user_id = $1', ['player-id']);
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM bag_clubs WHERE user_id = $1', ['player-id']);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('returns 404 for nonexistent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(adminApp).post('/nonexistent/clear-data');
      expect(res.status).toBe(404);
    });

    it('returns 400 for admin accounts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-id', role: 'admin' }] });

      const res = await request(adminApp).post('/admin-id/clear-data');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Admin accounts have no player data to clear');
    });
  });

  // ── DELETE /:id (admin only) ───────────────────────────────────────
  describe('DELETE /:id', () => {
    it('deletes user and cascades data in transaction', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'target-id' }] });

      const res = await request(adminApp).delete('/target-id');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', ['target-id']);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('returns 400 when trying to delete self', async () => {
      const res = await request(adminApp).delete(`/${TEST_USER_ID}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot delete your own account');
    });

    it('returns 404 for nonexistent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(adminApp).delete('/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(playerApp).delete('/some-id');
      expect(res.status).toBe(403);
    });
  });
});
