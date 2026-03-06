import { query } from '../db.js';
import { logger } from '../logger.js';

interface UsageEntry {
  service: string;
  endpoint?: string;
  userId?: string;
  inputTokens?: number;
  outputTokens?: number;
  items?: number;
  apiCalls?: number;
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget API usage log. Never throws. */
export function logApiUsage(entry: UsageEntry): void {
  query(
    `INSERT INTO api_usage (service, endpoint, user_id, input_tokens, output_tokens, items, api_calls, estimated_cost, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.service,
      entry.endpoint ?? null,
      entry.userId ?? null,
      entry.inputTokens ?? null,
      entry.outputTokens ?? null,
      entry.items ?? 1,
      entry.apiCalls ?? 1,
      entry.estimatedCost ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      Date.now(),
    ],
  ).catch((err) => logger.error('Failed to log API usage', { error: String(err) }));
}
