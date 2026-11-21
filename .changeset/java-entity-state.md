---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

A Java Edition player sees the mobs and players around them crouch, sprint, swim, glide, sleep and burn, when they come into view and as it changes. An entity's shown facts carry its state, the session presenter gains `showEntityState`, and `Metadata.getGenericFlag` reads a flag `setGenericFlag` wrote. `@jsprismarine/protocol` gains Java's `Set Entity Metadata` packet for the shared flags and the pose.
