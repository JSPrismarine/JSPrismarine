---
'@jsprismarine/prismarine': patch
---

Mobs from a monster spawner move again. A spawner placed a mob wherever its feet fit, so its box often reached into the spawner block or a wall, and the server refused every step the mob took. Each spawn now checks the mob's whole collision box first, as Java's `BaseSpawner` does. A mob that already stands partly inside a block, such as one an earlier spawner placed, walks out of it, because a block the body already overlaps no longer stops its walk or a sideways push.
