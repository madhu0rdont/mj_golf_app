import { validateShotField } from '../utils/validation';

const SYSTEM_PROMPT = `You are a data extraction assistant for golf launch monitor data.
Extract shot data from Foresight GC4/GCQuad session screenshots.
Return ONLY valid JSON — no other text, no markdown code fences.
Return an array of shot objects with these fields:
  shotNumber, carryYards, totalYards, ballSpeed, clubHeadSpeed,
  launchAngle, spinRate, spinAxis, apexHeight, offlineYards
Use null for any field not visible or not readable.
Numbers should be plain numbers (no units, no symbols).
For offlineYards: negative = left of target, positive = right.
For spinAxis: negative = draw spin, positive = fade spin.`;

const USER_PROMPT = 'Extract all shot data from this Foresight GC4 session summary. Return only a JSON array of shot objects.';

export interface ExtractedShot {
  shotNumber: number;
  carryYards: number | null;
  totalYards: number | null;
  ballSpeed: number | null;
  clubHeadSpeed: number | null;
  launchAngle: number | null;
  spinRate: number | null;
  spinAxis: number | null;
  apexHeight: number | null;
  offlineYards: number | null;
}

export interface ExtractionResult {
  shots: ExtractedShot[];
  warnings: string[];
}

export async function extractShotDataFromImage(
  imageBase64: string,
  mediaType: string,
  apiKey: string
): Promise<ExtractionResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20241022',
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
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const textContent = data.content?.find(
    (block: { type: string }) => block.type === 'text'
  );

  if (!textContent?.text) {
    throw new Error('No text response from API');
  }

  // Parse JSON from response (strip markdown fences if present)
  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let rawShots: ExtractedShot[];
  try {
    rawShots = JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse extracted data as JSON');
  }

  if (!Array.isArray(rawShots) || rawShots.length === 0) {
    throw new Error('No shot data found in the image');
  }

  // Validate and flag
  const warnings: string[] = [];
  const shots = rawShots.map((shot, i) => {
    const validated = { ...shot, shotNumber: shot.shotNumber ?? i + 1 };

    // Validate each numeric field
    const fields = [
      'carryYards', 'totalYards', 'ballSpeed', 'clubHeadSpeed',
      'launchAngle', 'spinRate', 'spinAxis', 'apexHeight', 'offlineYards',
    ] as const;

    for (const field of fields) {
      const value = validated[field];
      if (value != null && !validateShotField(field, value)) {
        warnings.push(`Shot ${validated.shotNumber}: ${field} value ${value} is out of range`);
      }
    }

    // Check carry is present
    if (validated.carryYards == null || validated.carryYards <= 0) {
      warnings.push(`Shot ${validated.shotNumber}: missing or invalid carry distance`);
    }

    // Check total >= carry
    if (validated.totalYards != null && validated.carryYards != null && validated.totalYards < validated.carryYards) {
      warnings.push(`Shot ${validated.shotNumber}: total (${validated.totalYards}) < carry (${validated.carryYards})`);
    }

    return validated;
  });

  return { shots, warnings };
}

export function imageFileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(',');
      const mediaType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
