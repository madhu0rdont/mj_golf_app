import { Router } from 'express';

const router = Router();

const SYSTEM_PROMPT = `You are a data extraction assistant for golf launch monitor data.
Extract shot data from Foresight GC4/GCQuad session screenshots.
Return ONLY valid JSON — no other text, no markdown code fences.
Return an array of shot objects with these fields:
  shotNumber, carryYards, totalYards, ballSpeed, clubHeadSpeed,
  launchAngle, spinRate, spinAxis, apexHeight, offlineYards,
  pushPull, sideSpinRate, descentAngle
Use null for any field not visible or not readable.
Numbers should be plain numbers (no units, no symbols).
For offlineYards: negative = left of target, positive = right.
For spinAxis: negative = draw spin, positive = fade spin.
For pushPull: positive = push (right), negative = pull (left).`;

const USER_PROMPT = 'Extract all shot data from this Foresight GC4 session summary. Return only a JSON array of shot objects.';

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// POST /api/extract — proxy image to Anthropic Claude Vision API
router.post('/', async (req, res) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'CLAUDE_API_KEY not configured on server' });
    }

    const { imageBase64, mediaType } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 must be a non-empty string' });
    }
    if (!mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: `mediaType must be one of: ${ALLOWED_MEDIA_TYPES.join(', ')}` });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: USER_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error: `Anthropic API error: ${error}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Failed to extract shot data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
