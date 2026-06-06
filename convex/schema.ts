import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  numbers: defineTable({
    value: v.number(),
  }),
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
});
