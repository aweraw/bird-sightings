import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser } from './users';

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('locations').withIndex('by_name', (q) => q).order('asc').collect();
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.insert('locations', {
      name: args.name.trim(),
      description: args.description?.trim() ?? '',
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('locations'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const patch: { name?: string; description?: string } = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    await ctx.db.patch(args.id, patch);
  },
});
