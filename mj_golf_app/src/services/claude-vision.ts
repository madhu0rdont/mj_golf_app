import { validateShotField } from '../utils/validation';
import { api } from '../lib/api';

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
  pushPull: number | null;
  sideSpinRate: number | null;
  descentAngle: number | null;
}

export interface ExtractionResult {
  shots: ExtractedShot[];
  warnings: string[];
}

export async function extractShotDataFromImage(
  imageBase64: string,
  mediaType: string
): Promise<ExtractionResult> {
  // Call our server proxy (API key is stored server-side)
  const data = await api.post<{
    content?: { type: string; text?: string }[];
  }>('/extract', { imageBase64, mediaType });

  const textContent = data.content?.find(
    (block) => block.type === 'text'
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
      'pushPull', 'sideSpinRate', 'descentAngle',
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

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;
const MAX_BASE64_BYTES = 4_500_000; // stay well under Anthropic's 5 MB limit

/** Resize + JPEG-compress an image file via canvas, then return base64 */
export function imageFileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Scale down if either dimension exceeds MAX_DIMENSION
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Try at default quality, reduce if still too large
      let quality = JPEG_QUALITY;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      let base64 = dataUrl.split(',')[1];

      while (base64.length > MAX_BASE64_BYTES && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        base64 = dataUrl.split(',')[1];
      }

      URL.revokeObjectURL(img.src);
      resolve({ base64, mediaType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}
