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
  stack?: boolean;
  percent?: boolean; // 100%-stacked (implies stack)
  angleTicks?: boolean; // angle x labels for long category names
};

export function BarChart({
  data,
  index,
  categories,
  colors = CHART_COLORS,
  valueFormatter = (v) => `${v}`,
  height = 288,
  stack = false,
  percent = false,
  angleTicks = false,
}: Props) {
  const stacked = stack || percent;
  const yFormatter = percent
    ? (v: number) => `${Math.round(v * 100)}%`
    : (v: number) => valueFormatter(v);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RBarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: angleTicks ? 28 : 0, left: 0 }}
          stackOffset={percent ? 'expand' : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey={index}
            tick={{ ...AXIS_TICK, fontSize: angleTicks ? 11 : 12 }}
            tickLine={false}
            axisLine={false}
            interval={angleTicks ? 0 : undefined}
            angle={angleTicks ? -25 : 0}
            textAnchor={angleTicks ? 'end' : 'middle'}
            height={angleTicks ? 80 : 30}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => yFormatter(Number(v))}
          />
          <Tooltip
            formatter={(v) => valueFormatter(Number(v))}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: GRID_STROKE, fillOpacity: 0.1 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map((cat, i) => (
            <Bar
              key={cat}
              dataKey={cat}
              stackId={stacked ? 'a' : undefined}
              fill={colors[i % colors.length]}
              radius={stacked ? 0 : [4, 4, 0, 0]}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
