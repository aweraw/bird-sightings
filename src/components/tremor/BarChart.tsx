import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, CHART_COLORS, GRID_STROKE, TOOLTIP_STYLE } from './colors';

type Props = {
  data: Record<string, unknown>[];
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  height?: number;
};

export function BarChart({
  data,
  index,
  categories,
  colors = CHART_COLORS,
  valueFormatter = (v) => `${v}`,
  height = 288,
}: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.2} vertical={false} />
          <XAxis dataKey={index} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v) => valueFormatter(Number(v))}
          />
          <Tooltip
            formatter={(v) => valueFormatter(Number(v))}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: GRID_STROKE, fillOpacity: 0.1 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map((cat, i) => (
            <Bar key={cat} dataKey={cat} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
