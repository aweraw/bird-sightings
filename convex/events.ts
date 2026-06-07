import { v } from 'convex/values';
import { internalMutation, mutation, query, MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';

// ---------------------------------------------------------------------------
// Writing events
// ---------------------------------------------------------------------------

type EventInput = {
  type: string;
  userId?: Id<'users'>;
  status?: 'ok' | 'error';
  timestamp?: number;
  durationMs?: number;
  errorMessage?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  requestBytes?: number;
  responseBytes?: number;
  metadata?: unknown;
};

/**
 * Shared writer. Call this DIRECTLY from inside other mutations (e.g.
 * addNumber) so the event lands in the same transaction as the action it
 * describes — no extra ctx.runMutation hop, no race window.
 */
export async function recordEvent(ctx: MutationCtx, event: EventInput) {
  return await ctx.db.insert('events', {
    type: event.type,
    userId: event.userId,
    status: event.status ?? 'ok',
    timestamp: event.timestamp ?? Date.now(),
    durationMs: event.durationMs,
    errorMessage: event.errorMessage,
    method: event.method,
    path: event.path,
    statusCode: event.statusCode,
    requestBytes: event.requestBytes,
    responseBytes: event.responseBytes,
    metadata: event.metadata,
  });
}

/**
 * Internal mutation wrapper around recordEvent. Needed because actions and
 * httpActions have no ctx.db — they must hop through ctx.runMutation to write.
 * (See http.ts.)
 */
export const logEvent = internalMutation({
  args: {
    type: v.string(),
    userId: v.optional(v.id('users')),
    status: v.optional(v.union(v.literal('ok'), v.literal('error'))),
    timestamp: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    method: v.optional(v.string()),
    path: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    requestBytes: v.optional(v.number()),
    responseBytes: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await recordEvent(ctx, args);
  },
});

/**
 * Public, client-callable writer for the one event a query can't record
 * itself: a view. Queries are read-only, so the recent-sightings list fires
 * this (fire-and-forget) on mount. userId is derived server-side and the type
 * is fixed here — the client can't spoof either.
 */
export const logView = mutation({
  args: { metadata: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return; // ignore anonymous views
    const user = await ctx.db
      .query('users')
      .withIndex('by_tokenId', (q) => q.eq('tokenId', identity.subject))
      .first();
    await recordEvent(ctx, {
      type: 'sighting.viewed',
      userId: user?._id,
      metadata: args.metadata,
    });
  },
});

// ---------------------------------------------------------------------------
// Backfill — synthetic event history for the dashboard. Internal-only: run via
// `npx convex run events:backfillEvents '{...}'` or the seed:seedAll
// orchestrator. References seeded synthetic users/sightings so login + sighting
// events point at real rows, and tags every row metadata.synthetic for clean
// teardown. Keep per-call counts modest; seedAll chunks larger volumes.
// ---------------------------------------------------------------------------

const SYNTHETIC_PREFIX = 'synthetic:';

export const backfillEvents = internalMutation({
  args: {
    count: v.optional(v.number()),
    days: v.optional(v.number()), // spread events across the past N days
  },
  handler: async (ctx, args) => {
    const count = args.count ?? 250;
    const windowMs = (args.days ?? 30) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Reference real seeded rows so events aren't orphaned.
    const users = (await ctx.db.query('users').collect()).filter((u) =>
      u.tokenId.startsWith(SYNTHETIC_PREFIX),
    );
    const userIds = new Set(users.map((u) => u._id));
    const sightings = users.length
      ? (await ctx.db.query('sighting').collect()).filter((s) => userIds.has(s.user))
      : [];

    const routes = [
      { method: 'GET', path: '/api/sightings' },
      { method: 'POST', path: '/api/sightings' },
      { method: 'GET', path: '/api/species' },
      { method: 'GET', path: '/api/ping' },
    ];
    // Weighted toward views; one entry per draw.
    const appTypes = [
      'sighting.viewed',
      'sighting.viewed',
      'sighting.created',
      'user.login',
      'sighting.updated',
    ];
    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    for (let i = 0; i < count; i++) {
      const timestamp = now - Math.floor(Math.random() * windowMs);
      const errored = Math.random() < 0.08; // ~8% error rate

      // ~50% HTTP metrics (no user); the rest are app events tied to seeded
      // users/sightings. With nothing seeded yet, everything falls back to HTTP.
      if (users.length === 0 || Math.random() < 0.5) {
        const route = pick(routes);
        await recordEvent(ctx, {
          type: 'http.request',
          status: errored ? 'error' : 'ok',
          timestamp,
          method: route.method,
          path: route.path,
          statusCode: errored ? (Math.random() < 0.5 ? 500 : 404) : 200,
          durationMs: Math.round(20 + Math.random() * 480),
          requestBytes: Math.round(Math.random() * 2048),
          responseBytes: Math.round(200 + Math.random() * 8192),
          errorMessage: errored ? 'Simulated failure' : undefined,
          metadata: { synthetic: true },
        });
      } else {
        const type = pick(appTypes);
        const sighting =
          type.startsWith('sighting.') && sightings.length ? pick(sightings) : undefined;
        const metadata: Record<string, unknown> = { synthetic: true };
        if (sighting) metadata.sighting = sighting._id;
        await recordEvent(ctx, {
          type,
          status: errored ? 'error' : 'ok',
          timestamp,
          userId: sighting ? sighting.user : pick(users)._id,
          durationMs: Math.round(Math.random() * 50),
          errorMessage: errored ? 'Simulated failure' : undefined,
          metadata,
        });
      }
    }

    return { inserted: count };
  },
});

// ---------------------------------------------------------------------------
// Reading events for charts. These aggregate at read time over a bounded time
// window — fine at simulation scale (hundreds–thousands of rows). At real
// volume, replace with rollup/bucket tables or the @convex-dev/aggregate
// component so a dashboard read doesn't scan the whole table.
// ---------------------------------------------------------------------------

/** Most recent events, for a raw activity feed / table view. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('events')
      .withIndex('by_timestamp')
      .order('desc')
      .take(args.limit ?? 50);
  },
});

/**
 * Time-bucketed HTTP metrics (request volume, error rate, avg latency, bytes)
 * shaped as an array ready to hand straight to recharts/tremor.
 */
export const httpMetrics = query({
  args: {
    windowHours: v.optional(v.number()),
    bucketMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const from = Date.now() - (args.windowHours ?? 24) * 60 * 60 * 1000;
    const bucketMs = (args.bucketMinutes ?? 60) * 60 * 1000;

    const rows = await ctx.db
      .query('events')
      .withIndex('by_type_and_timestamp', (q) =>
        q.eq('type', 'http.request').gte('timestamp', from),
      )
      .collect();

    const buckets = new Map<
      number,
      { requests: number; errors: number; durationSum: number; bytes: number }
    >();
    for (const e of rows) {
      const bucket = Math.floor(e.timestamp / bucketMs) * bucketMs;
      const agg =
        buckets.get(bucket) ?? { requests: 0, errors: 0, durationSum: 0, bytes: 0 };
      agg.requests += 1;
      if (e.status === 'error') agg.errors += 1;
      agg.durationSum += e.durationMs ?? 0;
      agg.bytes += (e.requestBytes ?? 0) + (e.responseBytes ?? 0);
      buckets.set(bucket, agg);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([bucket, agg]) => ({
        bucket, // ms epoch — format on the client
        requests: agg.requests,
        errors: agg.errors,
        errorRate: agg.requests ? agg.errors / agg.requests : 0,
        avgDurationMs: agg.requests ? Math.round(agg.durationSum / agg.requests) : 0,
        bytes: agg.bytes,
      }));
  },
});

/** Event counts grouped by type over a time window, for app-usage charts. */
export const usageByType = query({
  args: { windowHours: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const from = Date.now() - (args.windowHours ?? 24) * 60 * 60 * 1000;

    const rows = await ctx.db
      .query('events')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', from))
      .collect();

    const counts = new Map<string, number>();
    for (const e of rows) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  },
});

/** Headline KPI numbers over the last N days. */
export const dashboardSummary = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const from = Date.now() - (args.days ?? 30) * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query('events')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', from))
      .collect();

    let logins = 0;
    let sightingsCreated = 0;
    let httpRequests = 0;
    let httpErrors = 0;
    let latencySum = 0;
    let latencyCount = 0;
    const activeUsers = new Set<string>();

    for (const e of rows) {
      if (e.userId) activeUsers.add(e.userId);
      if (e.type === 'user.login') logins++;
      else if (e.type === 'sighting.created') sightingsCreated++;
      else if (e.type === 'http.request') {
        httpRequests++;
        if (e.status === 'error') httpErrors++;
        if (typeof e.durationMs === 'number') {
          latencySum += e.durationMs;
          latencyCount++;
        }
      }
    }

    return {
      totalEvents: rows.length,
      logins,
      sightingsCreated,
      activeUsers: activeUsers.size,
      httpRequests,
      httpErrorRate: httpRequests ? httpErrors / httpRequests : 0,
      avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : 0,
    };
  },
});

/** Per-day counts of the main event types, for a time-series chart. */
export const eventsByDay = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const from = Date.now() - (args.days ?? 30) * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query('events')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', from))
      .collect();

    const byDay = new Map<
      string,
      { date: string; logins: number; sightings: number; views: number; http: number }
    >();
    for (const e of rows) {
      const date = new Date(e.timestamp).toISOString().slice(0, 10);
      const b = byDay.get(date) ?? { date, logins: 0, sightings: 0, views: 0, http: 0 };
      if (e.type === 'user.login') b.logins++;
      else if (e.type === 'sighting.created') b.sightings++;
      else if (e.type === 'sighting.viewed') b.views++;
      else if (e.type === 'http.request') b.http++;
      byDay.set(date, b);
    }

    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  },
});
