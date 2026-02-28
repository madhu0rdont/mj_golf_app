import { toSnake } from '../db.js';

export const CLUB_COLUMNS = [
  'id', 'name', 'category', 'brand', 'model', 'loft', 'shaft', 'flex',
  'manual_carry', 'manual_total', 'computed_carry', 'computed_total',
  'preferred_shape', 'sort_order', 'created_at', 'updated_at',
];

export const SESSION_COLUMNS = [
  'id', 'club_id', 'date', 'location', 'notes', 'source',
  'shot_count', 'type', 'metadata', 'created_at', 'updated_at',
];

export const SHOT_COLUMNS = [
  'id', 'session_id', 'club_id', 'shot_number', 'carry_yards', 'total_yards',
  'ball_speed', 'club_head_speed', 'launch_angle', 'spin_rate', 'spin_axis',
  'apex_height', 'descent_angle', 'side_spin_rate', 'push_pull', 'offline_yards',
  'shape', 'quality', 'timestamp', 'position', 'hole_number',
];

/** Convert a camelCase object to snake_case, keeping only known columns */
export function pickColumns(obj: Record<string, unknown>, allowedColumns: string[]): Record<string, unknown> {
  const snake = toSnake(obj);
  const result: Record<string, unknown> = {};
  for (const col of allowedColumns) {
    if (col in snake) {
      result[col] = snake[col];
    }
  }
  return result;
}

export function buildInsert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const values = Object.values(row);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values,
  };
}
