import {mutation, query} from "./_generated/server";
import {v} from 'convex/values';

export const setUser = mutation({
    args: {},
    handler: async (ctx) => {
        const viewer = await ctx.auth.getUserIdentity();
        if (!viewer) {
            throw new Error('Not authenticated');
        }
        const profile = {
            email: viewer.email ?? '',
            firstName: viewer.givenName ?? '',
            lastName: viewer.familyName ?? '',
        };
        const existingUser = await ctx.db.query('users').withIndex('by_tokenId', q => q.eq('tokenId', viewer.subject)).first();
        if (existingUser) {
            await ctx.db.patch(existingUser._id, profile);
            return existingUser._id;
        }
        return await ctx.db.insert('users', {
            tokenId: viewer.subject,
            ...profile,
        });
    },
});

export const getUser = query({
    args: {
        user: v.id('users'),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.user);
        // console.log('Fetched user:', user);
        return user;
    },
});
