import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

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
      <div className="flex h-40 items-center justify-center text-sm text-gray-500">
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
        <XAxis dataKey="dateLabel" tick={{ fill: '#6b7280', fontSize: 10 }} />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#22c55e' }}
          formatter={(value) => [`${value} yds`, 'Avg Carry']}
        />
        <Line
          type="monotone"
          dataKey="avgCarry"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 4, fill: '#22c55e' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
