import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE } from './colors';

type Props = {
  data: Record<string, unknown>[];
  category: string; // numeric value key
  index: string; // label key
  colors?: string[];
  valueFormatter?: (value: number) => string;
  height?: number;
};

export function DonutChart({
  data,
  category,
  index,
  colors = CHART_COLORS,
  valueFormatter = (v) => `${v}`,
  height = 288,
}: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey={category}
            nameKey={index}
            innerRadius="60%"
            outerRadius="90%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => valueFormatter(Number(v))} contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
