import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { THEME } from '../../theme/colors';

interface DataPoint {
  date: number;
  avgCarry: number;
  sessionId: string;
}

interface CarryOverTimeChartProps {
  data: DataPoint[];
  bookCarry?: number;
}

/** Simple least-squares linear regression. Returns [slope, intercept]. */
export function linearRegression(ys: number[]): [number, number] {
  const n = ys.length;
  if (n < 2) return [0, ys[0] ?? 0];
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += ys[i];
    sxy += i * ys[i];
    sx2 += i * i;
  }
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return [0, sy / n];
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return [slope, intercept];
}

export function CarryOverTimeChart({ data, bookCarry }: CarryOverTimeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No session data yet
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => a.date - b.date);
  const carries = sorted.map((d) => d.avgCarry);
  const [slope, intercept] = linearRegression(carries);

  const formatted = sorted.map((d, i) => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    trend: Math.round((intercept + slope * i) * 10) / 10,
  }));

  // Show trend direction label
  const totalChange = slope * (carries.length - 1);
  const trendLabel =
    carries.length < 2
      ? null
      : totalChange > 0.5
        ? `+${totalChange.toFixed(1)} yds`
        : totalChange < -0.5
          ? `${totalChange.toFixed(1)} yds`
          : 'Stable';

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={formatted} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="carryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={THEME.primary} stopOpacity={0.15} />
              <stop offset="100%" stopColor={THEME.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="dateLabel" tick={{ fill: THEME.axisText, fontSize: 10 }} />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: THEME.axisText, fontSize: 10 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: THEME.tooltipBg,
              border: `1px solid ${THEME.tooltipBorder}`,
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: THEME.textMuted }}
            formatter={(value, name) => {
              const v = Number(value);
              if (name === 'trend') return [`${v} yds`, 'Trend'];
              const label = 'Avg Carry';
              if (bookCarry) {
                const delta = v - bookCarry;
                const sign = delta >= 0 ? '+' : '';
                return [`${v} yds (${sign}${delta.toFixed(1)} vs book)`, label];
              }
              return [`${v} yds`, label];
            }}
          />

          {/* Book carry reference line */}
          {bookCarry && (
            <ReferenceLine
              y={bookCarry}
              stroke={THEME.gold}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: 'Book',
                position: 'right',
                fill: THEME.gold,
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}

          {/* Gradient fill under the carry line */}
          <Area
            type="monotone"
            dataKey="avgCarry"
            fill="url(#carryFill)"
            stroke="none"
          />

          {/* Trend line (dashed) */}
          {carries.length >= 2 && (
            <Line
              type="linear"
              dataKey="trend"
              stroke={THEME.primaryLight}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
            />
          )}

          {/* Actual carry line */}
          <Line
            type="monotone"
            dataKey="avgCarry"
            stroke={THEME.primary}
            strokeWidth={2}
            dot={{ r: 4, fill: THEME.primary, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Trend summary */}
      {trendLabel && (
        <div className="flex items-center justify-end gap-3 mt-1 px-1">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="2">
              <line x1="0" y1="1" x2="20" y2="1" stroke={THEME.primaryLight} strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            <span className="text-[10px] text-text-muted">Trend: {trendLabel}</span>
          </div>
          {bookCarry && (
            <div className="flex items-center gap-1.5">
              <svg width="20" height="2">
                <line x1="0" y1="1" x2="20" y2="1" stroke={THEME.gold} strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
              <span className="text-[10px] text-text-muted">Book: {bookCarry}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
