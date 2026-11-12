---
"@jsprismarine/prismarine": patch
---

Keep what the change log does not hold in step with an undone unit of work. A player whose entry into a world is undone, as when its spawn fails, is taken out of the world's player map again and can enter on the next try. A death whose blow is undone sends no health, death line or respawn. A join whose start is undone accepts the client's retry. A kick inside a unit takes the player off once the unit ends, so an undo no longer brings back an entity with no session; `PlayerSession.leave` called inside a unit now runs when the unit ends.
