import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();

/**
 * A real, instrumented endpoint. This is where genuine HTTP metrics are
 * observable: unlike queries/mutations (which travel over the sync protocol),
 * an httpAction has a real Request/Response, so we can measure latency,
 * byte sizes, and status codes — then log them as an `http.request` event.
 *
 * Try it:
 *   curl -X POST <VITE_CONVEX_SITE_URL>/api/ping -d '{"hello":"world"}'
 * (note the .site domain, not .cloud)
 */
http.route({
  path: '/api/ping',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const start = Date.now();
    const url = new URL(request.url);
    const requestBody = await request.text();

    let statusCode = 200;
    let errorMessage: string | undefined;
    let responseBody = JSON.stringify({ ok: true, receivedBytes: requestBody.length });

    try {
      // Real handling would go here. For now it just echoes a size.
    } catch (err) {
      statusCode = 500;
      errorMessage = err instanceof Error ? err.message : String(err);
      responseBody = JSON.stringify({ ok: false });
    }

    // Actions/httpActions can't touch ctx.db directly — hop through the
    // internal mutation to persist the event.
    await ctx.runMutation(internal.events.logEvent, {
      type: 'http.request',
      status: statusCode < 400 ? 'ok' : 'error',
      method: request.method,
      path: url.pathname,
      statusCode,
      durationMs: Date.now() - start,
      requestBytes: requestBody.length,
      responseBytes: responseBody.length,
      errorMessage,
    });

    return new Response(responseBody, {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

export default http;
