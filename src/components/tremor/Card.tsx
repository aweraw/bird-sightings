import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small labelled metric for the KPI row. */
export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </Card>
  );
}
