import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  users: defineTable({
    tokenId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  }).index('by_tokenId', ['tokenId']),
  sighting: defineTable({
    user: v.id('users'),
    bird: v.id('species'),
    location: v.id('locations'),
    date: v.string(),
  }).index('by_sighting', ['user', 'bird', 'location', 'date']),
  species: defineTable({
    name: v.string(),
    description: v.string(),
  }),
  locations: defineTable({
    name: v.string(),
    description: v.string(),
  }),
  events: defineTable({
    type: v.string(), // e.g. "sighting.created", "number.added", "http.request"
    userId: v.optional(v.id('users')),
    status: v.union(v.literal('ok'), v.literal('error')),
    // Explicit event time (ms epoch) so simulated rows can be backdated;
    // _creationTime is insert-time only and can't be set.
    timestamp: v.number(),
    durationMs: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    // HTTP-request events only:
    method: v.optional(v.string()),
    path: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    requestBytes: v.optional(v.number()),
    responseBytes: v.optional(v.number()),
    // Free-form per-event payload:
    metadata: v.optional(v.any()),
  })
    .index('by_timestamp', ['timestamp'])
    .index('by_type_and_timestamp', ['type', 'timestamp'])
    .index('by_user_and_timestamp', ['userId', 'timestamp']),
});
