import { useState } from 'react';
import { Authenticated, Unauthenticated, useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Card, Metric } from './components/tremor/Card';
import { BarChart } from './components/tremor/BarChart';
import { DonutChart } from './components/tremor/DonutChart';
import { LineChart } from './components/tremor/LineChart';
import { field } from './pickers';

const RANGES = [7, 30, 90];
const num = (v: number) => v.toLocaleString();
const ms = (v: number) => `${v} ms`;
const bytesFmt = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)} MB` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} KB` : `${v} B`;
// 200 → green, 404 → amber, 500 → rose
const STATUS_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#6366f1'];

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
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
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
        <KpiStrip days={days} />
      </div>
      <HttpSection days={days} />
      <AppSection />
    </div>
  );
}

function KpiStrip({ days }: { days: number }) {
  const s = useQuery(api.events.summary, { days });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <Metric label="Total events" value={s ? num(s.totalEvents) : '…'} />
      <Metric label="Active users" value={s ? num(s.activeUsers) : '…'} />
      <Metric label="Logins" value={s ? num(s.logins) : '…'} />
      <Metric label="Sightings" value={s ? num(s.sightingsCreated) : '…'} />
      <Metric label="Success rate (non-5xx)" value={s ? `${(s.successRate * 100).toFixed(1)}%` : '…'} />
      <Metric label="HTTP error rate" value={s ? `${(s.httpErrorRate * 100).toFixed(1)}%` : '…'} />
      <Metric label="Avg latency" value={s ? ms(s.avgLatencyMs) : '…'} />
      <Metric label="p95 latency" value={s ? ms(s.p95LatencyMs) : '…'} />
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <p className="font-bold mb-3">{title}</p>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HTTP events
// ---------------------------------------------------------------------------

type DayRow = {
  date: string;
  endpoint: string;
  requests: number;
  errors: number;
  responseBytes: number;
  latencySum: number;
  latencyCount: number;
  status: Record<string, number>;
};
type ByDay = { endpoints: string[]; statusCodes: number[]; rows: DayRow[] };

/** One row per day, each endpoint as a column (for stacked metrics). */
function pivotByDay(byDay: ByDay | undefined, metric: 'requests' | 'errors' | 'responseBytes') {
  if (!byDay) return [];
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of byDay.rows) {
    let d = byDate.get(r.date);
    if (!d) {
      d = { label: r.date.slice(5) };
      for (const e of byDay.endpoints) d[e] = 0;
      byDate.set(r.date, d);
    }
    d[r.endpoint] = (d[r.endpoint] as number) + r[metric];
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

/** Avg latency per day with one column per endpoint (grouped bars). */
function latencyGroupedByDay(byDay: ByDay | undefined) {
  if (!byDay) return [];
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of byDay.rows) {
    let d = byDate.get(r.date);
    if (!d) {
      d = { label: r.date.slice(5) };
      for (const e of byDay.endpoints) d[e] = 0;
      byDate.set(r.date, d);
    }
    d[r.endpoint] = r.latencyCount ? Math.round(r.latencySum / r.latencyCount) : 0;
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

/** Status-code counts per day for a single endpoint (stacked bars). */
function statusByDay(byDay: ByDay | undefined, endpoint: string) {
  if (!byDay || !endpoint) return [];
  const codes = byDay.statusCodes.map(String);
  return byDay.rows
    .filter((r) => r.endpoint === endpoint)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const row: Record<string, number | string> = { label: r.date.slice(5) };
      for (const c of codes) row[c] = r.status[c] ?? 0;
      return row;
    });
}

/** Error rate (%) per day across all endpoints. */
function errorRateByDay(byDay: ByDay | undefined) {
  if (!byDay) return [];
  const m = new Map<string, { req: number; err: number }>();
  for (const r of byDay.rows) {
    const a = m.get(r.date) ?? { req: 0, err: 0 };
    a.req += r.requests;
    a.err += r.errors;
    m.set(r.date, a);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, a]) => ({
      label: date.slice(5),
      'error %': a.req ? Number(((100 * a.err) / a.req).toFixed(1)) : 0,
    }));
}

/** Responses per day bucketed into 2xx / 4xx / 5xx classes. */
function statusClassByDay(byDay: ByDay | undefined) {
  if (!byDay) return [];
  const cls = (code: number) => (code >= 500 ? '5xx' : code >= 400 ? '4xx' : '2xx');
  const m = new Map<string, Record<string, number | string>>();
  for (const r of byDay.rows) {
    let d = m.get(r.date);
    if (!d) {
      d = { label: r.date.slice(5), '2xx': 0, '4xx': 0, '5xx': 0 };
      m.set(r.date, d);
    }
    for (const [code, count] of Object.entries(r.status)) {
      const k = cls(Number(code));
      d[k] = (d[k] as number) + count;
    }
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

function HttpSection({ days }: { days: number }) {
  const byDay = useQuery(api.events.httpByDay, { days });
  const pct = useQuery(api.events.latencyPercentilesByDay, { days });
  const endpoints = byDay?.endpoints ?? [];
  const statusCodes = (byDay?.statusCodes ?? []).map(String);
  const pctData = (pct ?? []).map((d) => ({ label: d.date.slice(5), p50: d.p50, p95: d.p95, p99: d.p99 }));

  const [statusEndpoint, setStatusEndpoint] = useState('');
  const activeEndpoint = statusEndpoint || endpoints[0] || '';

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xl font-bold">HTTP events</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Error rate / day">
          <LineChart
            data={errorRateByDay(byDay)}
            index="label"
            categories={['error %']}
            colors={['#f43f5e']}
            valueFormatter={(v) => `${v}%`}
          />
        </ChartCard>
        <ChartCard title="Responses by status class / day">
          <BarChart
            data={statusClassByDay(byDay)}
            index="label"
            categories={['2xx', '4xx', '5xx']}
            colors={['#10b981', '#f59e0b', '#f43f5e']}
            valueFormatter={num}
            stack
          />
        </ChartCard>
      </div>

      <ChartCard title="Latency percentiles / day">
        <LineChart
          data={pctData}
          index="label"
          categories={['p50', 'p95', 'p99']}
          colors={['#3b82f6', '#f59e0b', '#f43f5e']}
          valueFormatter={ms}
        />
      </ChartCard>

      <ChartCard title="Avg latency per endpoint, per day">
        <BarChart data={latencyGroupedByDay(byDay)} index="label" categories={endpoints} valueFormatter={ms} />
      </ChartCard>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="font-bold">Status codes / day</p>
          <select
            className={field}
            value={activeEndpoint}
            onChange={(e) => setStatusEndpoint(e.target.value)}
          >
            {endpoints.map((ep) => (
              <option key={ep} value={ep}>
                {ep}
              </option>
            ))}
          </select>
        </div>
        <BarChart
          data={statusByDay(byDay, activeEndpoint)}
          index="label"
          categories={statusCodes}
          colors={STATUS_COLORS}
          valueFormatter={num}
          stack
        />
      </Card>

      <ChartCard title="Errors / day by endpoint">
        <BarChart data={pivotByDay(byDay, 'errors')} index="label" categories={endpoints} valueFormatter={num} stack />
      </ChartCard>

      <ChartCard title="Requests / day by endpoint">
        <BarChart data={pivotByDay(byDay, 'requests')} index="label" categories={endpoints} valueFormatter={num} stack />
      </ChartCard>

      <ChartCard title="Response bytes / day by endpoint">
        <BarChart data={pivotByDay(byDay, 'responseBytes')} index="label" categories={endpoints} valueFormatter={bytesFmt} stack />
      </ChartCard>

    </section>
  );
}

// ---------------------------------------------------------------------------
// Application events
// ---------------------------------------------------------------------------

function AppSection() {
  const totals = useQuery(api.analytics.observationTotals);
  const locations = useQuery(api.locations.list) ?? [];
  const species = useQuery(api.species.list) ?? [];

  const [locId, setLocId] = useState<Id<'locations'> | ''>('');
  const [spId, setSpId] = useState<Id<'species'> | ''>('');
  const activeLoc = (locId || locations[0]?._id) as Id<'locations'> | undefined;
  const activeSp = (spId || species[0]?._id) as Id<'species'> | undefined;

  const perLocation = useQuery(
    api.analytics.observationsByLocation,
    activeLoc ? { locationId: activeLoc } : 'skip',
  );
  const perSpecies = useQuery(
    api.analytics.observationsBySpecies,
    activeSp ? { speciesId: activeSp } : 'skip',
  );

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xl font-bold">Application events</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Observations by location">
          <DonutChart data={totals?.byLocation ?? []} category="count" index="name" valueFormatter={num} />
        </ChartCard>
        <ChartCard title="Observations by species">
          <DonutChart data={totals?.bySpecies ?? []} category="count" index="name" valueFormatter={num} />
        </ChartCard>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="font-bold">Species observed at location</p>
          <select
            className={field}
            value={activeLoc ?? ''}
            onChange={(e) => setLocId(e.target.value as Id<'locations'>)}
          >
            {locations.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <BarChart data={perLocation ?? []} index="name" categories={['count']} valueFormatter={num} height={340} angleTicks />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="font-bold">Locations for species</p>
          <select
            className={field}
            value={activeSp ?? ''}
            onChange={(e) => setSpId(e.target.value as Id<'species'>)}
          >
            {species.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <BarChart data={perSpecies ?? []} index="name" categories={['count']} valueFormatter={num} height={340} angleTicks />
      </Card>
    </section>
  );
}
