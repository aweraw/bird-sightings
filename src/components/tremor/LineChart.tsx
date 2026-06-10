import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RLineChart,
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

export function LineChart({
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
        <RLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.2} vertical={false} />
          <XAxis dataKey={index} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => valueFormatter(Number(v))}
          />
          <Tooltip formatter={(v) => valueFormatter(Number(v))} contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map((cat, i) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
