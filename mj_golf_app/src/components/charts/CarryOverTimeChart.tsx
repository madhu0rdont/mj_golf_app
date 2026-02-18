import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { THEME } from '../../theme/colors';

interface DataPoint {
  date: number;
  avgCarry: number;
  sessionId: string;
}

interface CarryOverTimeChartProps {
  data: DataPoint[];
}

export function CarryOverTimeChart({ data }: CarryOverTimeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No session data yet
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => a.date - b.date);
  const formatted = sorted.map((d) => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={formatted} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
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
          itemStyle={{ color: THEME.primary }}
          formatter={(value) => [`${value} yds`, 'Avg Carry']}
        />
        <Line
          type="monotone"
          dataKey="avgCarry"
          stroke={THEME.primary}
          strokeWidth={2}
          dot={{ r: 4, fill: THEME.primary }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
