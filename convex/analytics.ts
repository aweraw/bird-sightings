import { v } from 'convex/values';
import { query, QueryCtx } from './_generated/server';
import { Id } from './_generated/dataModel';

// App-data dashboard aggregations. Scoped to SYNTHETIC users' sightings so the
// demo charts match the seeded dataset. "Observation" = one species recorded on
// one sighting (a sightingSpecies row).

const SYNTHETIC_PREFIX = 'synthetic:';

async function syntheticUserIds(ctx: QueryCtx): Promise<Set<Id<'users'>>> {
  const users = await ctx.db.query('users').collect();
  return new Set(users.filter((u) => u.tokenId.startsWith(SYNTHETIC_PREFIX)).map((u) => u._id));
}

/** Total observations per location and per species (for the two donuts). */
export const observationTotals = query({
  args: {},
  handler: async (ctx) => {
    const userIds = await syntheticUserIds(ctx);
    const sightings = (await ctx.db.query('sighting').collect()).filter((s) => userIds.has(s.user));
    const locationName = new Map(
      (await ctx.db.query('locations').collect()).map((l) => [l._id, l.name]),
    );
    const speciesName = new Map(
      (await ctx.db.query('species').collect()).map((s) => [s._id, s.name]),
    );

    const byLocation = new Map<Id<'locations'>, number>();
    const bySpecies = new Map<Id<'species'>, number>();
    for (const s of sightings) {
      const links = await ctx.db
        .query('sightingSpecies')
        .withIndex('by_sighting', (q) => q.eq('sighting', s._id))
        .collect();
      byLocation.set(s.location, (byLocation.get(s.location) ?? 0) + links.length);
      for (const l of links) {
        bySpecies.set(l.species, (bySpecies.get(l.species) ?? 0) + 1);
      }
    }

    return {
      byLocation: [...byLocation.entries()]
        .map(([id, count]) => ({ name: locationName.get(id) ?? 'Unknown', count }))
        .sort((a, b) => b.count - a.count),
      bySpecies: [...bySpecies.entries()]
        .map(([id, count]) => ({ name: speciesName.get(id) ?? 'Unknown', count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});

/** Observations per species at one location (for the per-location bar). */
export const observationsByLocation = query({
  args: { locationId: v.id('locations') },
  handler: async (ctx, args) => {
    const userIds = await syntheticUserIds(ctx);
    const sightings = (await ctx.db.query('sighting').collect()).filter(
      (s) => s.location === args.locationId && userIds.has(s.user),
    );
    const speciesName = new Map(
      (await ctx.db.query('species').collect()).map((s) => [s._id, s.name]),
    );

    const counts = new Map<Id<'species'>, number>();
    for (const s of sightings) {
      const links = await ctx.db
        .query('sightingSpecies')
        .withIndex('by_sighting', (q) => q.eq('sighting', s._id))
        .collect();
      for (const l of links) {
        counts.set(l.species, (counts.get(l.species) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([id, count]) => ({ name: speciesName.get(id) ?? 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  },
});

/** Observations per location for one species (for the per-species bar). */
export const observationsBySpecies = query({
  args: { speciesId: v.id('species') },
  handler: async (ctx, args) => {
    const userIds = await syntheticUserIds(ctx);
    const locationName = new Map(
      (await ctx.db.query('locations').collect()).map((l) => [l._id, l.name]),
    );

    const links = await ctx.db
      .query('sightingSpecies')
      .withIndex('by_species', (q) => q.eq('species', args.speciesId))
      .collect();

    const counts = new Map<Id<'locations'>, number>();
    for (const l of links) {
      const sighting = await ctx.db.get(l.sighting);
      if (!sighting || !userIds.has(sighting.user)) continue;
      counts.set(sighting.location, (counts.get(sighting.location) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([id, count]) => ({ name: locationName.get(id) ?? 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  },
});
