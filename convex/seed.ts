import { v } from 'convex/values';
import { FunctionReference } from 'convex/server';
import { internalAction, internalMutation, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';

// All functions here are internal: invokable from the CLI (`npx convex run
// seed:seedAll`) and the dashboard, but never exposed on the public client API.

const SYNTHETIC_PREFIX = 'synthetic:';

// name, scientific name (matches the species already in the table).
const SPECIES: [string, string][] = [
  ['Pied Butcherbird', 'Cracticus nigrogularis'],
  ['Pied Currawong', 'Strepera graculina'],
  ['Magpie', 'Gymnorhina tibicen'],
  ['Sulphur-crested Cockatoo', 'Cacatua galerita'],
  ['Pale-headed Rosella', 'Platycercus adscitus'],
  ['Rainbow Lorikeet', 'Trichoglossus moluccanus'],
  ['White Ibis', 'Threskiornis moluccus'],
  ['Royal Spoonbill', 'Platalea regia'],
  ['Wood duck', 'Chenonetta jubata'],
  ['Australasian swamphen', 'Porphyrio melanotus'],
  ['Little Corella', 'Cacatua sanguinea'],
  ['Galah', 'Eolophus roseicapilla'],
  ['Laughing Kookaburra', 'Dacelo novaeguineae'],
  ['Masked Lapwing', 'Vanellus miles'],
  ['Willie Wagtail', 'Rhipidura leucophrys'],
];

const LOCATIONS: [string, string][] = [
  ['Riverside Park', 'Wooded park along the river.'],
  ['Coastal Cliffs', 'Seabird colonies on exposed headland.'],
  ['Marsh Reserve', 'Protected wetland with hides.'],
  ['Botanic Gardens', 'Cultivated gardens with mixed habitat.'],
  ['Eucalypt Forest', 'Mature eucalypt forest.'],
  ['Harbour Front', 'Working harbour with gulls and terns.'],
];

const FIRST = [
  'Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Ethan', 'Mia', 'Lucas', 'Sophia', 'Mason',
  'Isla', 'Leo', 'Grace', 'Finn', 'Ruby', 'Jack', 'Nora', 'Owen', 'Maya', 'Theo',
];
const LAST = [
  'Bennett', 'Carter', 'Diaz', 'Evans', 'Foster', 'Greene', 'Hughes', 'Ito', 'Jensen',
  'Kelly', 'Lowe', 'Marsh', 'Novak', 'Owens', 'Patel', 'Quinn', 'Reyes', 'Singh',
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Insert the bird + location catalog (idempotent — skips names already present). */
export const ensureCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const haveSpecies = new Set((await ctx.db.query('species').collect()).map((s) => s.name));
    let species = 0;
    for (const [name, description] of SPECIES) {
      if (!haveSpecies.has(name)) {
        await ctx.db.insert('species', { name, description });
        species++;
      }
    }

    const haveLocations = new Set((await ctx.db.query('locations').collect()).map((l) => l.name));
    let locations = 0;
    for (const [name, description] of LOCATIONS) {
      if (!haveLocations.has(name)) {
        await ctx.db.insert('locations', { name, description });
        locations++;
      }
    }

    return { species, locations };
  },
});

/** Create synthetic user rows, tagged via tokenId so teardown can find them. */
export const seedUsers = internalMutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const count = args.count ?? 15;
    let created = 0;
    for (let i = 0; i < count; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const suffix = Math.floor(Math.random() * 1e9).toString(36);
      await ctx.db.insert('users', {
        tokenId: `${SYNTHETIC_PREFIX}user:${suffix}`,
        email: `${first}.${last}.${suffix}@example.com`.toLowerCase(),
        firstName: first,
        lastName: last,
      });
      created++;
    }
    return { created };
  },
});

/** Create backdated outings for random synthetic users. Emits no events — the
 *  event history is generated separately by events:backfillEvents. */
export const seedSightings = internalMutation({
  args: { count: v.optional(v.number()), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const count = args.count ?? 50;
    const windowMs = (args.days ?? 30) * 24 * 60 * 60 * 1000;

    const users = (await ctx.db.query('users').collect()).filter((u) =>
      u.tokenId.startsWith(SYNTHETIC_PREFIX),
    );
    const species = await ctx.db.query('species').collect();
    const locations = await ctx.db.query('locations').collect();
    if (users.length === 0) throw new Error('No synthetic users — run seed:seedUsers first.');
    if (species.length === 0 || locations.length === 0) {
      throw new Error('Empty catalog — run seed:ensureCatalog first.');
    }

    let created = 0;
    for (let i = 0; i < count; i++) {
      const user = pick(users);
      const location = pick(locations);
      const date = new Date(Date.now() - Math.floor(Math.random() * windowMs))
        .toISOString()
        .slice(0, 10);

      const sightingId = await ctx.db.insert('sighting', {
        user: user._id,
        location: location._id,
        date,
      });

      // 1–4 distinct species per outing.
      const shuffled = [...species].sort(() => Math.random() - 0.5);
      const n = 1 + Math.floor(Math.random() * Math.min(4, shuffled.length));
      for (const sp of shuffled.slice(0, n)) {
        await ctx.db.insert('sightingSpecies', { sighting: sightingId, species: sp._id });
      }
      created++;
    }
    return { created };
  },
});

async function syntheticUserIds(ctx: QueryCtx): Promise<Set<Id<'users'>>> {
  const users = await ctx.db.query('users').collect();
  return new Set(users.filter((u) => u.tokenId.startsWith(SYNTHETIC_PREFIX)).map((u) => u._id));
}

// Teardown is paginated: a single mutation can only read ~4096 docs, and the
// events table alone exceeds that. Each batch mutation deletes one page; the
// clearSynthetic action drives them with a cursor until each table is drained.

const CLEAR_BATCH = 256;
const cursorArg = { cursor: v.union(v.string(), v.null()) };

/** Delete one page of synthetic events (tagged metadata.synthetic). */
export const clearSyntheticEvents = internalMutation({
  args: cursorArg,
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('events').paginate({ numItems: CLEAR_BATCH, cursor });
    let deleted = 0;
    for (const e of page.page) {
      if ((e.metadata as { synthetic?: boolean } | undefined)?.synthetic === true) {
        await ctx.db.delete(e._id);
        deleted++;
      }
    }
    return { isDone: page.isDone, cursor: page.continueCursor, deleted };
  },
});

/** Delete one page of synthetic-user sightings, with their species links. */
export const clearSyntheticSightings = internalMutation({
  args: cursorArg,
  handler: async (ctx, { cursor }) => {
    const userIds = await syntheticUserIds(ctx);
    const page = await ctx.db.query('sighting').paginate({ numItems: CLEAR_BATCH, cursor });
    let deleted = 0;
    for (const s of page.page) {
      if (!userIds.has(s.user)) continue;
      const links = await ctx.db
        .query('sightingSpecies')
        .withIndex('by_sighting', (q) => q.eq('sighting', s._id))
        .collect();
      for (const l of links) await ctx.db.delete(l._id);
      await ctx.db.delete(s._id);
      deleted++;
    }
    return { isDone: page.isDone, cursor: page.continueCursor, deleted };
  },
});

/** Delete one page of synthetic users. */
export const clearSyntheticUsers = internalMutation({
  args: cursorArg,
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('users').paginate({ numItems: CLEAR_BATCH, cursor });
    let deleted = 0;
    for (const u of page.page) {
      if (u.tokenId.startsWith(SYNTHETIC_PREFIX)) {
        await ctx.db.delete(u._id);
        deleted++;
      }
    }
    return { isDone: page.isDone, cursor: page.continueCursor, deleted };
  },
});

type BatchResult = { isDone: boolean; cursor: string | null; deleted: number };

/** Teardown: remove synthetic events, synthetic-user sightings/links, and
 *  synthetic users. Leaves your real account and the catalog intact. Idempotent. */
type ClearBatchRef = FunctionReference<'mutation', 'internal', { cursor: string | null }, BatchResult>;

export const clearSynthetic = internalAction({
  args: {},
  handler: async (ctx): Promise<{ events: number; sightings: number; users: number }> => {
    const drain = async (ref: ClearBatchRef) => {
      let cursor: string | null = null;
      let total = 0;
      for (;;) {
        const r: BatchResult = await ctx.runMutation(ref, { cursor });
        total += r.deleted;
        if (r.isDone) break;
        cursor = r.cursor;
      }
      return total;
    };

    const events = await drain(internal.seed.clearSyntheticEvents);
    const sightings = await drain(internal.seed.clearSyntheticSightings);
    const users = await drain(internal.seed.clearSyntheticUsers);
    return { events, sightings, users };
  },
});

/** One-shot demo dataset: catalog → users → sightings → events, in order.
 *  Larger inserts are chunked across mutations so none does too much. */
export const seedAll = internalAction({
  args: {
    users: v.optional(v.number()),
    sightings: v.optional(v.number()),
    events: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const usersN = args.users ?? 15;
    const sightingsN = args.sightings ?? 120;
    const eventsN = args.events ?? 1500;
    const days = args.days ?? 30;

    const catalog: { species: number; locations: number } = await ctx.runMutation(
      internal.seed.ensureCatalog,
      {},
    );
    const usersResult: { created: number } = await ctx.runMutation(internal.seed.seedUsers, {
      count: usersN,
    });

    let sightings = 0;
    while (sightings < sightingsN) {
      const n = Math.min(40, sightingsN - sightings);
      const r: { created: number } = await ctx.runMutation(internal.seed.seedSightings, {
        count: n,
        days,
      });
      sightings += r.created;
    }

    let events = 0;
    while (events < eventsN) {
      const n = Math.min(250, eventsN - events);
      const r: { inserted: number } = await ctx.runMutation(internal.events.backfillEvents, {
        count: n,
        days,
      });
      events += r.inserted;
    }

    return { catalog, users: usersResult.created, sightings, events };
  },
});
