# One entity index, and a position write is visible to the next query

Status: accepted

The world kept two entity indexes with opposite rules. `world/EntityGrid.ts` was rebuilt from a copy of the entity list at the top of every tick, and its comment required a snapshot so results do not depend on iteration order. `entity/data/entityGrid.ts` refiles on every position write, and its comment says a per-tick rebuild "would answer a different question". We keep one index. A position write is visible to every later query in the same tick, and a query returns entities in ascending runtime id order. One position setter feeds the index, so no write can bypass it. The index serves AI, collision, item merge and pickup, explosions, chunk unload and viewer tracking.

Exact visibility is how Java runs an entity tick, where an entity sees the ones that already moved, and it is what mobs use today. The snapshot existed so a shove would not depend on map iteration order. Making the order a stated contract meets that need without hiding moves from queries. By the time of this decision the snapshot's remaining callers were item merge, item pickup and explosions, all of which work under exact visibility.

The index is derived state, so it is outside the replay digest (ADR 0006). Cell layout is an implementation choice, as long as every consumer sees the same answer for the same query.
