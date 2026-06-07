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

// ---------------------------------------------------------------------------
// Simulation — seed the table so the dashboard has something to chart.
// DEV/SEED TOOL: this is a public mutation for convenience (run it from the
// Convex dashboard's function runner). Remove or guard it before production.
// ---------------------------------------------------------------------------

export const simulate = mutation({
  args: {
    count: v.optional(v.number()), // default 200
    windowHours: v.optional(v.number()), // spread events across the past N hours
  },
  handler: async (ctx, args) => {
    const count = args.count ?? 200;
    const windowMs = (args.windowHours ?? 24) * 60 * 60 * 1000;
    const now = Date.now();

    const appTypes = ['sighting.created', 'user.login', 'number.added', 'species.viewed'];
    const routes = [
      { method: 'GET', path: '/api/sightings' },
      { method: 'POST', path: '/api/sightings' },
      { method: 'GET', path: '/api/species' },
      { method: 'GET', path: '/api/ping' },
    ];

    for (let i = 0; i < count; i++) {
      const timestamp = now - Math.floor(Math.random() * windowMs);
      const errored = Math.random() < 0.08; // ~8% error rate

      if (Math.random() < 0.5) {
        // HTTP-request event
        const route = routes[Math.floor(Math.random() * routes.length)];
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
        });
      } else {
        // App-usage event
        await recordEvent(ctx, {
          type: appTypes[Math.floor(Math.random() * appTypes.length)],
          status: errored ? 'error' : 'ok',
          timestamp,
          durationMs: Math.round(Math.random() * 50),
          errorMessage: errored ? 'Simulated failure' : undefined,
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
