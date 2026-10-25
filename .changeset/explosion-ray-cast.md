---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Cast Java's explosion rays instead of clearing a sphere.

`@jsprismarine/engine-systems` gains `explode`, a transcription of `ServerExplosion` from the
pinned 26.3 jar: 1352 rays off the surface of a 16 by 16 by 16 grid, each starting at
`radius * (0.7 + random * 0.6)` and losing `(blastResistance + 0.3) * 0.3` per block it crosses and
0.22500001 per 0.3-block step. The blocks behind a wall now survive, a one-block moat tames TNT,
and the crater is the irregular shape vanilla's is. Entity damage comes off
`getSeenPercent`, which grades cover by sampling a grid of rays over the entity's box, and
knockback reads `EXPLOSION_KNOCKBACK_RESISTANCE`.

The server no longer holds its own model. `entity/Explosion.ts` and the data-driven runtime's
`explode` both call the package, so a creeper destroys terrain where it used to leave the hole for
later, and every block a blast takes out is rolled through its Java loot table with the
`explosion_radius` parameter that `survives_explosion` and `explosion_decay` turn into a `1 / radius`
chance.
