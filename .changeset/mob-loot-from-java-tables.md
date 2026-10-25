---
'@jsprismarine/prismarine': minor
---

Roll mob drops out of Java's loot tables and delete `DropTable`.

Mobs were the last thing on a hand-written table. Fifty entries in `src/entity/LootTables.ts` stated
what twenty-five species leave behind, and they could state nothing else: no looting bonus, no drop
a player has to be credited for, no cooked meat off a burning cow, no wool of the sheep's own
color, and odds remembered rather than read. Several were simply wrong - a piglin dropped a gold
nugget, which Java has never given one.

`src/entity/mobLoot.ts` replaces them, built the way `src/block/blockLoot.ts` already was: an index
from every `minecraft:entities/...` table the pack stack registered, through
`@jsprismarine/mapping`, to the Bedrock identifier it belongs to, so a `minecraft:zombie_pigman`
finds `minecraft:entities/zombified_piglin`. A death supplies the context those tables read - where
the mob stood, what it was, how it died and who swung, with the killer's main hand carrying the
looting level and the damage type's tags read off the stack's own `tags/damage_type/` files.

Both loot callers now pass a `LevelView`, built by the new `lootLevelOf` in
`src/world/lootLevel.ts`, so the conditions that ask about the world rather than about the thing
that died can be reached at all. It answers the clock and the dimension and deliberately leaves out
the members the server cannot answer truthfully yet.

Breaking: `src/block/DropTable.ts` and `src/entity/LootTables.ts` are gone, with `DropTable`,
`DropChance`, `MOB_LOOT` and `lootOf`. `Random` and `randomOf` moved to `src/utils/Random.ts` and
are still exported from the package root. `Mob` gains a protected `lootState` hook for the species
whose table branches on something only that species has.
