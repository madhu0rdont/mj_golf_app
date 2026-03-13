import { Router } from 'express';
import { query, toCamel } from '../../db.js';
import { logger } from '../../logger.js';

const router = Router();

// GET /api/admin/usage — API usage and spend dashboard data
router.get('/usage', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // Summary by service
    const { rows: summaryRows } = await query(
      `SELECT service,
              COUNT(*)::int AS calls,
              COALESCE(SUM(estimated_cost), 0) AS total_cost,
              COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
              COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
              COALESCE(SUM(items), 0)::int AS total_items,
              COALESCE(SUM(api_calls), 0)::int AS total_api_calls
       FROM api_usage
       WHERE created_at >= $1
       GROUP BY service`,
      [since],
    );

    const summary: Record<string, unknown> = {};
    let totalCost = 0;
    for (const row of summaryRows) {
      summary[row.service] = {
        calls: row.calls,
        totalCost: parseFloat(row.total_cost),
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalItems: row.total_items,
        totalApiCalls: row.total_api_calls,
      };
      totalCost += parseFloat(row.total_cost);
    }

    // Daily breakdown
    const { rows: dailyRows } = await query(
      `SELECT
         TO_CHAR(TO_TIMESTAMP(created_at / 1000), 'YYYY-MM-DD') AS date,
         service,
         COALESCE(SUM(estimated_cost), 0) AS cost
       FROM api_usage
       WHERE created_at >= $1
       GROUP BY date, service
       ORDER BY date`,
      [since],
    );

    // Pivot daily rows into { date, claude, google_elevation, resend }
    const dailyMap = new Map<string, Record<string, number>>();
    for (const row of dailyRows) {
      if (!dailyMap.has(row.date)) dailyMap.set(row.date, { claude: 0, google_elevation: 0, google_maps: 0, resend: 0 });
      dailyMap.get(row.date)![row.service] = parseFloat(row.cost);
    }
    const daily = Array.from(dailyMap.entries()).map(([date, costs]) => ({ date, ...costs }));

    // Recent entries
    const { rows: recentRows } = await query(
      `SELECT u.id, u.service, u.endpoint, u.user_id,
              us.username, u.input_tokens, u.output_tokens,
              u.items, u.api_calls, u.estimated_cost, u.created_at
       FROM api_usage u
       LEFT JOIN users us ON us.id = u.user_id
       WHERE u.created_at >= $1
       ORDER BY u.created_at DESC
       LIMIT 50`,
      [since],
    );

    res.json({
      summary: { ...summary, totalCost },
      daily,
      recent: recentRows.map(toCamel),
    });
  } catch (err) {
    logger.error('Failed to fetch usage data', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/railway-usage — estimated Railway spend for current billing cycle
const RAILWAY_PROJECT_ID = process.env.RAILWAY_PROJECT_ID ?? '7fd20f07-7e08-43d4-aa1e-065a955a91d6';
const RAILWAY_GQL = 'https://backboard.railway.com/graphql/v2';
// Per-unit rates from Railway pricing (https://docs.railway.com/pricing)
const RAILWAY_RATES: Record<string, number> = {
  CPU_USAGE: 20 / 43200,        // $20/vCPU-month, usage in vCPU-minutes
  MEMORY_USAGE_GB: 10 / 43200,  // $10/GB-month, usage in GB-minutes
  DISK_USAGE_GB: 0.15 / 720,    // $0.15/GB-month, usage in GB-hours
  NETWORK_TX_GB: 0.05,          // $0.05/GB
};

let railwayCache: { data: unknown; ts: number } | null = null;
const RAILWAY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/railway-usage', async (_req, res) => {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    return res.json({ estimatedCost: null });
  }

  // Return cached result if fresh
  if (railwayCache && Date.now() - railwayCache.ts < RAILWAY_CACHE_TTL) {
    return res.json(railwayCache.data);
  }

  try {
    const measurements = Object.keys(RAILWAY_RATES);
    const resp = await fetch(RAILWAY_GQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `{ estimatedUsage(projectId: "${RAILWAY_PROJECT_ID}", measurements: [${measurements.join(', ')}]) { measurement estimatedValue } }`,
      }),
    });

    const json = await resp.json() as { data?: { estimatedUsage: { measurement: string; estimatedValue: number }[] }; errors?: unknown[] };
    if (json.errors || !json.data) {
      logger.error('Railway API error', { errors: json.errors });
      return res.json({ estimatedCost: null });
    }

    const breakdown: Record<string, number> = {};
    let estimatedCost = 0;
    for (const entry of json.data.estimatedUsage) {
      const rate = RAILWAY_RATES[entry.measurement];
      if (rate != null) {
        const cost = entry.estimatedValue * rate;
        const key = entry.measurement.replace(/_USAGE|_GB/g, '').toLowerCase();
        breakdown[key] = (breakdown[key] ?? 0) + cost;
        estimatedCost += cost;
      }
    }

    const result = { estimatedCost, breakdown };
    railwayCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch Railway usage', { error: String(err) });
    res.json({ estimatedCost: null });
  }
});

export default router;
