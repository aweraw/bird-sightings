import { mutation, query, QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { recordEvent } from './events';

// ---------------------------------------------------------------------------
// Auth helpers (shared by other function modules)
// ---------------------------------------------------------------------------

/** The JWT identity, or throws. Gate READS with this — needs no DB row. */
export async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
}

/** The current user's row, or null if unauthenticated / not yet synced. */
export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await requireIdentity(ctx);
  if (!identity) return null;
  return await ctx.db
    .query('users')
    .withIndex('by_tokenId', (q) => q.eq('tokenId', identity.subject))
    .first();
}

/** The current user's row, or throws. Gate WRITES that need user._id. */
export async function requireUser(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error('User record not found');
  return user;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export const setUser = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await ctx.auth.getUserIdentity();
    if (!viewer) {
      throw new Error('Not authenticated');
    }
    // WorkOS sends these as raw OIDC claims; the customJwt provider passes them
    // through under their original snake_case keys.
    const profile = {
      email: viewer.email ?? '',
      firstName: viewer.givenName ?? '',
      lastName: viewer.familyName ?? '',
    };
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_tokenId', (q) => q.eq('tokenId', viewer.subject))
      .first();

    let userId;
    if (existingUser) {
      await ctx.db.patch(existingUser._id, profile);
      userId = existingUser._id;
    } else {
      userId = await ctx.db.insert('users', { tokenId: viewer.subject, ...profile });
    }

    // Runs on every mount, so this is really a "session start" signal — fine
    // for usage metrics; debounce later if you want true login-only counts.
    await recordEvent(ctx, {
      type: 'user.login',
      userId,
      metadata: { firstTime: !existingUser },
    });

    return userId;
  },
});

export const getUser = query({
  args: {
    user: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.user);
  },
});

/** The current user's row (or null), keyed off the JWT identity. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});
