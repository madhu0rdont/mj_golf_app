import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, mockDbModule } from '../helpers/setup.js';

// Mock the db module (extract.ts does not use it, but it's imported transitively)
mockDbModule();

// Import AFTER mocking
import extractRouter from '../../routes/extract.js';

const app = createTestApp(extractRouter);

// Store the original fetch and env
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

describe('extract routes', () => {
  beforeEach(() => {
    process.env.CLAUDE_API_KEY = 'test-api-key';
    // Mock global fetch
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── POST / ─────────────────────────────────────────────────────────
  describe('POST /', () => {
    it('with valid imageBase64 and mediaType succeeds', async () => {
      const mockApiResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  { shotNumber: 1, carryYards: 250, totalYards: 270 },
                ]),
              },
            ],
          }),
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockApiResponse);

      const res = await request(app)
        .post('/')
        .send({
          imageBase64: 'base64encodeddata',
          mediaType: 'image/png',
        });

      expect(res.status).toBe(200);
      expect(res.body.content).toBeDefined();

      // Verify fetch was called with correct params
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('with missing imageBase64 returns 400', async () => {
      const res = await request(app)
        .post('/')
        .send({ mediaType: 'image/png' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
      expect(res.body.details.imageBase64).toBeDefined();
    });

    it('with missing mediaType returns 400', async () => {
      const res = await request(app)
        .post('/')
        .send({ imageBase64: 'base64data' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
      expect(res.body.details.mediaType).toBeDefined();
    });

    it('returns 500 when CLAUDE_API_KEY is not configured', async () => {
      delete process.env.CLAUDE_API_KEY;

      const res = await request(app)
        .post('/')
        .send({ imageBase64: 'data', mediaType: 'image/png' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('CLAUDE_API_KEY not configured');
    });

    it('returns error status when Anthropic API returns error', async () => {
      const mockApiResponse = {
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockApiResponse);

      const res = await request(app)
        .post('/')
        .send({
          imageBase64: 'base64data',
          mediaType: 'image/png',
        });

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Anthropic API error');
    });

    it('returns 500 on network/API error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const res = await request(app)
        .post('/')
        .send({
          imageBase64: 'base64data',
          mediaType: 'image/png',
        });

      expect(res.status).toBe(500);
    });
  });
});
