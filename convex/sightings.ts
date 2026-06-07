import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { recordEvent } from './events';
import { requireUser } from './users';

export const create = mutation({
  args: {
    locationId: v.id('locations'),
    date: v.string(), // ISO 8601
    speciesIds: v.array(v.id('species')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const speciesIds = [...new Set(args.speciesIds)]; // de-dupe within a checklist
    if (speciesIds.length === 0) {
      throw new Error('Select at least one species');
    }

    // Outing + child rows + event all commit together in one transaction.
    const sightingId = await ctx.db.insert('sighting', {
      user: user._id,
      location: args.locationId,
      date: args.date,
    });
    for (const species of speciesIds) {
      await ctx.db.insert('sightingSpecies', { sighting: sightingId, species });
    }
    await recordEvent(ctx, {
      type: 'sighting.created',
      userId: user._id,
      metadata: { location: args.locationId, speciesCount: speciesIds.length },
    });

    return sightingId;
  },
});

/**
 * Recent outings, newest first, with location/observer/species resolved for
 * display. N+1-ish (a few reads per row) — fine at this scale; swap for a
 * denormalized read model if the feed ever gets large.
 */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {

    const sightings = await ctx.db
      .query('sighting')
      .withIndex('by_date')
      .order('desc')
      .take(args.limit ?? 50);

    return await Promise.all(
      sightings.map(async (s) => {
        const [location, observer, links] = await Promise.all([
          ctx.db.get(s.location),
          ctx.db.get(s.user),
          ctx.db
            .query('sightingSpecies')
            .withIndex('by_sighting', (q) => q.eq('sighting', s._id))
            .collect(),
        ]);
        const species = await Promise.all(links.map((l) => ctx.db.get(l.species)));

        return {
          _id: s._id,
          date: s.date,
          location: location && { _id: location._id, name: location.name },
          observer: observer && {
            _id: observer._id,
            name:
              [observer.firstName, observer.lastName].filter(Boolean).join(' ').trim() ||
              observer.email,
          },
          species: species.flatMap((sp) => (sp ? [{ _id: sp._id, name: sp.name }] : [])),
        };
      }),
    );
  },
});

/**
 * The current user's own outings, newest first. Returns raw ids (location +
 * species) so the edit form can pre-select them.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const sightings = await ctx.db
      .query('sighting')
      .withIndex('by_user', (q) => q.eq('user', user._id))
      .order('desc')
      .collect();

    return await Promise.all(
      sightings.map(async (s) => {
        const [location, links] = await Promise.all([
          ctx.db.get(s.location),
          ctx.db
            .query('sightingSpecies')
            .withIndex('by_sighting', (q) => q.eq('sighting', s._id))
            .collect(),
        ]);
        const species = await Promise.all(links.map((l) => ctx.db.get(l.species)));
        return {
          _id: s._id,
          date: s.date,
          locationId: s.location,
          locationName: location?.name ?? null,
          species: species.flatMap((sp) => (sp ? [{ _id: sp._id, name: sp.name }] : [])),
        };
      }),
    );
  },
});

export const update = mutation({
  args: {
    id: v.id('sighting'),
    locationId: v.id('locations'),
    date: v.string(),
    speciesIds: v.array(v.id('species')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const sighting = await ctx.db.get(args.id);
    if (!sighting) throw new Error('Sighting not found');
    if (sighting.user !== user._id) throw new Error('Not your sighting');

    const desired = new Set(args.speciesIds);
    if (desired.size === 0) throw new Error('Select at least one species');

    await ctx.db.patch(args.id, { location: args.locationId, date: args.date });

    // Reconcile the species links: delete removed, insert added, leave the rest.
    const existing = await ctx.db
      .query('sightingSpecies')
      .withIndex('by_sighting', (q) => q.eq('sighting', args.id))
      .collect();
    const existingIds = new Set(existing.map((l) => l.species));
    for (const link of existing) {
      if (!desired.has(link.species)) await ctx.db.delete(link._id);
    }
    for (const species of desired) {
      if (!existingIds.has(species)) {
        await ctx.db.insert('sightingSpecies', { sighting: args.id, species });
      }
    }

    await recordEvent(ctx, {
      type: 'sighting.updated',
      userId: user._id,
      metadata: { sighting: args.id, speciesCount: desired.size },
    });
  },
});

export const remove = mutation({
  args: { id: v.id('sighting') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const sighting = await ctx.db.get(args.id);
    if (!sighting) return; // already deleted
    if (sighting.user !== user._id) throw new Error('Not your sighting');

    const links = await ctx.db
      .query('sightingSpecies')
      .withIndex('by_sighting', (q) => q.eq('sighting', args.id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(args.id);

    await recordEvent(ctx, {
      type: 'sighting.deleted',
      userId: user._id,
      metadata: { sighting: args.id },
    });
  },
});
