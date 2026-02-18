export interface ValidationRange {
  min: number;
  max: number;
  label: string;
}

export const SHOT_FIELD_RANGES: Record<string, ValidationRange> = {
  carryYards: { min: 0, max: 400, label: 'Carry' },
  totalYards: { min: 0, max: 450, label: 'Total' },
  ballSpeed: { min: 50, max: 220, label: 'Ball Speed' },
  clubHeadSpeed: { min: 40, max: 160, label: 'Club Speed' },
  launchAngle: { min: -10, max: 60, label: 'Launch Angle' },
  spinRate: { min: 0, max: 15000, label: 'Spin Rate' },
  spinAxis: { min: -45, max: 45, label: 'Spin Axis' },
  apexHeight: { min: 0, max: 80, label: 'Apex' },
  offlineYards: { min: -100, max: 100, label: 'Offline' },
};

export function validateShotField(field: string, value: number): boolean {
  const range = SHOT_FIELD_RANGES[field];
  if (!range) return true;
  return value >= range.min && value <= range.max;
}

export function validateAllShotFields(
  shot: Record<string, number | undefined>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, range] of Object.entries(SHOT_FIELD_RANGES)) {
    const value = shot[field];
    if (value != null && (value < range.min || value > range.max)) {
      errors[field] = `${range.label} must be between ${range.min} and ${range.max}`;
    }
  }
  return errors;
}
