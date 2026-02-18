import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';
import type { YardageBookEntry } from '../../models/yardage';
import { THEME } from '../../theme/colors';

interface GappingChartProps {
  entries: YardageBookEntry[];
}

const CATEGORY_COLORS = THEME.category;

export function GappingChart({ entries }: GappingChartProps) {
  // Sort by carry descending
  const sorted = [...entries]
    .filter((e) => e.bookCarry > 0)
    .sort((a, b) => b.bookCarry - a.bookCarry);

  const data = sorted.map((e) => ({
    name: e.clubName,
    carry: e.bookCarry,
    category: e.category,
  }));

  // Calculate gaps
  const gaps: { between: string; gap: number; isLarge: boolean }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i].bookCarry - sorted[i + 1].bookCarry;
    gaps.push({
      between: `${sorted[i].clubName} → ${sorted[i + 1].clubName}`,
      gap: Math.round(gap * 10) / 10,
      isLarge: gap > 15,
    });
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={sorted.length * 44 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 60, right: 40, top: 10, bottom: 10 }}>
          <XAxis type="number" domain={[0, 'auto']} tick={{ fill: THEME.axisText, fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: THEME.textMedium, fontSize: 12 }}
            width={55}
          />
          <Bar dataKey="carry" radius={[0, 4, 4, 0]} barSize={24}>
            {data.map((entry, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[entry.category] || '#6b7280'} />
            ))}
            <LabelList
              dataKey="carry"
              position="right"
              fill={THEME.textMuted}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Gap annotations */}
      {gaps.length > 0 && (
        <div className="mt-4 space-y-1">
          <h4 className="text-xs font-medium text-text-muted uppercase mb-2">Gaps</h4>
          {gaps.map((g, i) => (
            <div
              key={i}
              className={`flex justify-between rounded-lg px-3 py-1.5 text-xs ${
                g.isLarge ? 'bg-amber-50 text-amber-700' : 'text-text-medium'
              }`}
            >
              <span>{g.between}</span>
              <span className="font-medium">
                {g.gap} yds {g.isLarge && '⚠'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
