import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList } from 'recharts';
import type { YardageBookEntry } from '../../models/yardage';
import { THEME } from '../../theme/colors';

interface GappingChartProps {
  entries: YardageBookEntry[];
}

const CATEGORY_COLORS = THEME.category;

/** Custom bar shape that renders dashed outlines for imputed clubs */
function GappingBar(props: any) {
  const { x, y, width, height, fill, imputed } = props;
  if (imputed) {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={fill}
        fillOpacity={0.25}
        stroke={fill}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    );
  }
  return <rect x={x} y={y} width={width} height={height} rx={4} fill={fill} />;
}

export function GappingChart({ entries }: GappingChartProps) {
  // Sort by carry descending
  const sorted = [...entries]
    .filter((e) => e.bookCarry > 0)
    .sort((a, b) => b.bookCarry - a.bookCarry);

  const data = sorted.map((e) => ({
    name: e.clubName,
    carry: e.bookCarry,
    category: e.category,
    imputed: !!e.imputed,
  }));

  const hasImputed = data.some((d) => d.imputed);

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
          <Bar
            dataKey="carry"
            barSize={24}
            shape={(props: any) => {
              const item = data[props.index];
              return (
                <GappingBar
                  {...props}
                  fill={CATEGORY_COLORS[item?.category] || '#6b7280'}
                  imputed={item?.imputed}
                />
              );
            }}
          >
            <LabelList
              dataKey="carry"
              position="right"
              fill={THEME.textMuted}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend for imputed */}
      {hasImputed && (
        <div className="flex items-center gap-2 mt-1 mb-3 px-1">
          <svg width="24" height="12">
            <rect x="0" y="2" width="24" height="8" rx="2" fill="#6b7280" fillOpacity={0.25} stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          <span className="text-[11px] text-text-muted">Imputed (no shot data)</span>
        </div>
      )}

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
