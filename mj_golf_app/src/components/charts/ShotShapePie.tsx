import { PieChart, Pie, Cell, ResponsiveContainer, Legend, type PieLabelRenderProps } from 'recharts';
import type { ShotShape } from '../../models/session';
import { THEME } from '../../theme/colors';

interface ShotShapePieProps {
  distribution: Partial<Record<ShotShape, number>>;
}

const SHAPE_COLORS: Record<ShotShape, string> = THEME.shotShape as Record<ShotShape, string>;

const SHAPE_LABELS: Record<ShotShape, string> = {
  straight: 'Straight',
  draw: 'Draw',
  fade: 'Fade',
  hook: 'Hook',
  slice: 'Slice',
  pull: 'Pull',
  push: 'Push',
};

export function ShotShapePie({ distribution }: ShotShapePieProps) {
  const data = Object.entries(distribution)
    .filter(([, count]) => count && count > 0)
    .map(([shape, count]) => ({
      name: SHAPE_LABELS[shape as ShotShape],
      value: count!,
      color: SHAPE_COLORS[shape as ShotShape],
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No shape data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
          label={(props: PieLabelRenderProps) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-text-medium">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
