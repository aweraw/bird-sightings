import {
  Area,
  AreaChart as RAreaChart,
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

export function AreaChart({
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
        <RAreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {categories.map((cat, i) => (
              <linearGradient key={cat} id={`area-${cat}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.4} />
                <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.2} vertical={false} />
          <XAxis dataKey={index} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v) => valueFormatter(Number(v))}
          />
          <Tooltip formatter={(v) => valueFormatter(Number(v))} contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map((cat, i) => (
            <Area
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={colors[i % colors.length]}
              fill={`url(#area-${cat})`}
              strokeWidth={2}
            />
          ))}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
