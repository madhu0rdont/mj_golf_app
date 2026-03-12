import { useState, useEffect, useMemo } from 'react';
import { Cpu, Mountain, Mail, Server, Map, Loader2, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';

interface ServiceSummary {
  calls: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  totalItems: number;
  totalApiCalls: number;
}

interface DailyEntry {
  date: string;
  claude: number;
  google_elevation: number;
  google_maps: number;
  resend: number;
  railway?: number;
}

interface RecentEntry {
  id: number;
  service: string;
  endpoint: string | null;
  userId: string | null;
  username: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  items: number;
  apiCalls: number;
  estimatedCost: number | null;
  createdAt: number;
}

interface UsageData {
  summary: Record<string, ServiceSummary> & { totalCost: number };
  daily: DailyEntry[];
  recent: RecentEntry[];
}

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function formatCost(cost: number): string {
  if (cost < 0.01) return cost > 0 ? '<$0.01' : '$0.00';
  return `$${cost.toFixed(2)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const SERVICE_COLORS: Record<string, string> = {
  claude: '#8B5CF6',
  google_elevation: '#3B82F6',
  google_maps: '#F59E0B',
  resend: '#10B981',
  railway: '#64748B',
};

const SERVICE_LABELS: Record<string, string> = {
  claude: 'Claude Vision',
  google_elevation: 'Google Elevation',
  google_maps: 'Google Maps',
  resend: 'Resend Email',
  railway: 'Railway',
};

function DailyChart({ data }: { data: DailyEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-text-muted">
        No data yet
      </div>
    );
  }

  const maxCost = Math.max(...data.map(d => (d.claude ?? 0) + (d.google_elevation ?? 0) + (d.google_maps ?? 0) + (d.resend ?? 0) + (d.railway ?? 0)), 0.001);
  const barWidth = Math.max(4, Math.min(20, Math.floor(280 / data.length) - 2));
  const chartWidth = data.length * (barWidth + 2) + 40;
  const chartHeight = 120;
  const topPad = 8;
  const bottomPad = 20;
  const usableHeight = chartHeight - topPad - bottomPad;

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(chartWidth, 280)} height={chartHeight} className="text-text-muted">
        {/* Y-axis label */}
        <text x={2} y={topPad + 8} fontSize={9} fill="currentColor">{formatCost(maxCost)}</text>
        <text x={2} y={chartHeight - bottomPad} fontSize={9} fill="currentColor">$0</text>
        {/* Grid line */}
        <line x1={36} y1={chartHeight - bottomPad} x2={chartWidth} y2={chartHeight - bottomPad} stroke="currentColor" strokeOpacity={0.15} />

        {data.map((d, i) => {
          const x = 40 + i * (barWidth + 2);
          let y = chartHeight - bottomPad;

          const segments = [
            { key: 'railway', val: d.railway ?? 0 },
            { key: 'resend', val: d.resend ?? 0 },
            { key: 'google_maps', val: d.google_maps ?? 0 },
            { key: 'google_elevation', val: d.google_elevation ?? 0 },
            { key: 'claude', val: d.claude ?? 0 },
          ];

          return (
            <g key={d.date}>
              {segments.map(seg => {
                if (seg.val <= 0) return null;
                const h = Math.max(1, (seg.val / maxCost) * usableHeight);
                y -= h;
                return (
                  <rect
                    key={seg.key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={SERVICE_COLORS[seg.key]}
                    rx={1}
                  >
                    <title>{`${d.date}: ${SERVICE_LABELS[seg.key]} ${formatCost(seg.val)}`}</title>
                  </rect>
                );
              })}
              {/* Date label every few bars */}
              {(i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0) && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 4}
                  fontSize={8}
                  fill="currentColor"
                  textAnchor="middle"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface RailwayUsage {
  estimatedCost: number | null;
  breakdown?: Record<string, number>;
}

export function UsageDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [railway, setRailway] = useState<RailwayUsage | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<UsageData>(`/admin/usage?days=${days}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    api.get<RailwayUsage>('/admin/railway-usage')
      .then(setRailway)
      .catch(() => setRailway(null));
  }, []);

  const claude = data?.summary?.claude as ServiceSummary | undefined;
  const google = data?.summary?.google_elevation as ServiceSummary | undefined;
  const googleMaps = data?.summary?.google_maps as ServiceSummary | undefined;
  const resend = data?.summary?.resend as ServiceSummary | undefined;
  const apiCost = data?.summary?.totalCost ?? 0;
  const railwayCost = railway?.estimatedCost ?? 0;

  // Monthly estimate: extrapolate API costs to 30 days + Railway billing cycle estimate
  const apiMonthly = days > 0 ? (apiCost / days) * 30 : 0;
  const monthlyEstimate = apiMonthly + railwayCost;

  // Add Railway as flat daily rate to chart data
  const dailyRailway = railwayCost / 30;
  const chartData = useMemo(() =>
    (data?.daily ?? []).map(d => ({ ...d, railway: dailyRailway })),
    [data?.daily, dailyRailway],
  );

  // Legend items
  const legend = useMemo(() => [
    { color: SERVICE_COLORS.claude, label: 'Claude' },
    { color: SERVICE_COLORS.google_elevation, label: 'Elevation' },
    { color: SERVICE_COLORS.google_maps, label: 'Maps' },
    { color: SERVICE_COLORS.resend, label: 'Resend' },
    { color: SERVICE_COLORS.railway, label: 'Railway' },
  ], []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-light text-text-dark">Usage & Spend</h2>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                days === p.days
                  ? 'bg-turf/15 text-primary'
                  : 'text-text-muted hover:text-text-dark'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <>
          {/* Cost banner */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border border-border bg-card p-3 text-center">
              <p className="text-xs text-text-muted mb-0.5">API Spend ({days}d)</p>
              <p className="text-2xl font-display font-light text-text-dark">{formatCost(apiCost)}</p>
            </div>
            <div className="rounded-sm border border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-xs text-text-muted mb-0.5">Est. Monthly Total</p>
              <p className="text-2xl font-display font-light text-text-dark">~{formatCost(monthlyEstimate)}</p>
              <div className="flex justify-center gap-3 mt-1 text-[9px] text-text-muted">
                <span>API ~{formatCost(apiMonthly)}</span>
                <span>Railway ~{formatCost(railwayCost)}</span>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Claude */}
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-violet-500/10">
                  <Cpu size={14} className="text-violet-500" />
                </div>
                <p className="text-xs font-medium text-text-dark">Claude Vision</p>
              </div>
              <p className="text-lg font-display font-light text-text-dark">{formatCost(claude?.totalCost ?? 0)}</p>
              <div className="text-[10px] text-text-muted mt-1 space-y-0.5">
                <p>{claude?.calls ?? 0} extractions</p>
                {claude && claude.inputTokens > 0 && (
                  <p>{formatNumber(claude.inputTokens)} in / {formatNumber(claude.outputTokens)} out tokens</p>
                )}
              </div>
            </div>

            {/* Google */}
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-500/10">
                  <Mountain size={14} className="text-blue-500" />
                </div>
                <p className="text-xs font-medium text-text-dark">Google Elevation</p>
              </div>
              <p className="text-lg font-display font-light text-text-dark">{formatCost(google?.totalCost ?? 0)}</p>
              <div className="text-[10px] text-text-muted mt-1 space-y-0.5">
                <p>{google?.totalApiCalls ?? 0} API calls</p>
                {google && google.totalItems > 0 && (
                  <p>{formatNumber(google.totalItems)} coordinates</p>
                )}
              </div>
            </div>

            {/* Resend */}
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500/10">
                  <Mail size={14} className="text-emerald-500" />
                </div>
                <p className="text-xs font-medium text-text-dark">Resend Email</p>
              </div>
              <p className="text-lg font-display font-light text-text-dark">{formatCost(resend?.totalCost ?? 0)}</p>
              <div className="text-[10px] text-text-muted mt-1">
                <p>{resend?.calls ?? 0} emails sent</p>
              </div>
            </div>

            {/* Railway */}
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-500/10">
                  <Server size={14} className="text-slate-400" />
                </div>
                <p className="text-xs font-medium text-text-dark">Railway</p>
              </div>
              {railway?.estimatedCost != null ? (
                <>
                  <p className="text-lg font-display font-light text-text-dark">{formatCost(railway.estimatedCost)}</p>
                  <div className="text-[10px] text-text-muted mt-1 space-y-0.5">
                    {railway.breakdown && Object.entries(railway.breakdown).map(([key, cost]) => (
                      <p key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}: {formatCost(cost)}</p>
                    ))}
                    <p className="text-[9px] opacity-60">Est. billing cycle total</p>
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-text-muted">Hosting & compute costs</p>
              )}
              <a
                href="https://railway.com/project/7fd20f07-7e08-43d4-aa1e-065a955a91d6/observability?environmentId=1ab35e5b-0f25-4498-8855-94863acdf360"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary mt-2 hover:underline"
              >
                <ExternalLink size={12} />
                <span>View Dashboard</span>
              </a>
            </div>

            {/* Google Maps */}
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-amber-500/10">
                  <Map size={14} className="text-amber-500" />
                </div>
                <p className="text-xs font-medium text-text-dark">Google Maps</p>
              </div>
              {googleMaps ? (
                <>
                  <p className="text-lg font-display font-light text-text-dark">{formatCost(googleMaps.totalCost)}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{googleMaps.totalApiCalls} loads</p>
                </>
              ) : (
                <p className="text-[10px] text-text-muted">No impressions tracked yet</p>
              )}
              <a
                href="https://console.cloud.google.com/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-primary mt-1.5"
              >
                <ExternalLink size={10} />
                <span>View Console</span>
              </a>
            </div>
          </div>

          {/* Daily chart */}
          <div className="rounded-sm border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-text-dark">Daily Spend</p>
              <div className="flex gap-3">
                {legend.map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
                    <span className="text-[10px] text-text-muted">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <DailyChart data={chartData} />
          </div>

          {/* Recent activity */}
          <div className="rounded-sm border border-border bg-card p-3">
            <p className="text-xs font-medium text-text-dark mb-2">Recent Activity</p>
            {data?.recent && data.recent.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-text-muted border-b border-border">
                      <th className="text-left py-1 pr-2 font-medium">Time</th>
                      <th className="text-left py-1 pr-2 font-medium">Service</th>
                      <th className="text-left py-1 pr-2 font-medium">Endpoint</th>
                      <th className="text-left py-1 pr-2 font-medium">User</th>
                      <th className="text-right py-1 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map(entry => (
                      <tr key={entry.id} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-2 text-text-muted whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                        <td className="py-1.5 pr-2">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              backgroundColor: `${SERVICE_COLORS[entry.service] ?? '#6B7280'}15`,
                              color: SERVICE_COLORS[entry.service] ?? '#6B7280',
                            }}
                          >
                            {SERVICE_LABELS[entry.service] ?? entry.service}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-text-dark">{entry.endpoint ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-text-muted">{entry.username ?? '—'}</td>
                        <td className="py-1.5 text-right text-text-dark">{formatCost(entry.estimatedCost ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-text-muted text-center py-4">No API calls recorded yet</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
