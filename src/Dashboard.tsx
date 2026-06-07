import { useState } from 'react';
import { Authenticated, Unauthenticated, useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../convex/_generated/api';
import { Card, Metric } from './components/tremor/Card';
import { AreaChart } from './components/tremor/AreaChart';
import { BarChart } from './components/tremor/BarChart';
import { DonutChart } from './components/tremor/DonutChart';

const RANGES = [7, 30, 90];
const num = (v: number) => v.toLocaleString();

export default function Dashboard() {
  return (
    <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Metrics dashboard</h2>
        <Link to="/" className="text-sm underline hover:no-underline">
          ← Back
        </Link>
      </div>
      <Authenticated>
        <DashboardBody />
      </Authenticated>
      <Unauthenticated>
        <p>Please sign in to view the dashboard.</p>
      </Unauthenticated>
    </div>
  );
}

function DashboardBody() {
  const [days, setDays] = useState(30);
  const summary = useQuery(api.events.dashboardSummary, { days });
  const byDay = useQuery(api.events.eventsByDay, { days });
  const byType = useQuery(api.events.usageByType, { windowHours: days * 24 });
  const http = useQuery(api.events.httpMetrics, { windowHours: days * 24, bucketMinutes: 1440 });

  const activity = (byDay ?? []).map((d) => ({ ...d, label: d.date.slice(5) }));
  const httpDaily = (http ?? []).map((h) => ({
    ...h,
    label: new Date(h.bucket).toISOString().slice(5, 10),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setDays(r)}
            className={`text-sm px-3 py-1 rounded-md border-2 ${
              days === r
                ? 'bg-dark dark:bg-light text-light dark:text-dark'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            {r}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Metric label="Total events" value={summary ? num(summary.totalEvents) : '…'} />
        <Metric label="Active users" value={summary ? num(summary.activeUsers) : '…'} />
        <Metric label="Logins" value={summary ? num(summary.logins) : '…'} />
        <Metric label="Sightings" value={summary ? num(summary.sightingsCreated) : '…'} />
        <Metric
          label="HTTP error rate"
          value={summary ? `${(summary.httpErrorRate * 100).toFixed(1)}%` : '…'}
        />
        <Metric label="Avg latency" value={summary ? `${summary.avgLatencyMs} ms` : '…'} />
      </div>

      <Card>
        <p className="font-bold mb-2">Activity over time</p>
        <AreaChart
          data={activity}
          index="label"
          categories={['logins', 'sightings', 'views', 'http']}
          valueFormatter={num}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <p className="font-bold mb-2">Event mix</p>
          <DonutChart data={byType ?? []} category="count" index="type" valueFormatter={num} />
        </Card>
        <Card>
          <p className="font-bold mb-2">HTTP requests / day</p>
          <BarChart data={httpDaily} index="label" categories={['requests']} valueFormatter={num} />
        </Card>
      </div>

      <Card>
        <p className="font-bold mb-2">Avg HTTP latency / day</p>
        <AreaChart
          data={httpDaily}
          index="label"
          categories={['avgDurationMs']}
          colors={['#06b6d4']}
          valueFormatter={(v) => `${v} ms`}
        />
      </Card>
    </div>
  );
}
