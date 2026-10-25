---
'@jsprismarine/prismarine': minor
'@jsprismarine/entities': patch
---

Give a mob the equipment its table rolls, and show it to the clients watching.

`minecraft:equipment` was parsed and thrown away. Its factory returned `{}`, so no mob ever rolled
its table: a census of 90 live bodies found none holding an item, and `Entity.setHeldItem` had no
callers anywhere. A skeleton fired from an empty fist, and the villager's trade offer and the
enderman's carried block were written to `MobBody.carried` by the goals and read back only by other
goals, because nothing mirrored them onto the body a client is sent.

Bedrock drives mob gear from a loot table where Java hardcodes it in
`Mob.populateDefaultEquipmentSlots`, so the component's `table` is the reference for what a mob
spawns holding. Those tables are the behavior pack's own and Java has no counterpart: its registry
carries `entities/skeleton` but no `entities/skeleton_gear`, and its only three `equipment/` tables
are trial chamber ones. The roll therefore reads `definitions.lootTables` through the evaluator in
`@jsprismarine/loot` rather than through a second evaluator written for it. Which slot a rolled item
lands in comes from the item's own `minecraft:equippable`, so a table naming `minecraft:iron_helmet`
dresses the head without a table of identifiers here going stale.

Pools this evaluator cannot gate are left out. `@jsprismarine/loot` implements modern Java, where a
pool carries one `condition`; Bedrock still writes the older plural `conditions` array and adds a
pool-level `tiers`. A condition that is not read is a condition that does not gate, and handed
`zombie_equipment.json` whole the evaluator armed 2000 of 2000 zombies where vanilla arms about one
in twenty. What survives the pruning is each mob's signature weapon, the part that fires
unconditionally in vanilla too: measured against a running server, 13 of the 18 vanilla types that
carry the component get theirs, among them the skeleton's bow, the pillager's crossbow, the
vindicator's axe, the wither skeleton's stone sword and the piglin's golden one. What is dropped is
the chance-gated extras and the tiered armor sets, for which absent is both the safe direction and
the common vanilla outcome. Reading the rest needs a Bedrock loot dialect in `@jsprismarine/loot`.

Equipment reaches a client through one write funnel, the shape `blockentity/blockEntityWrite.ts`
set. A revision counter answers whether anything was written at all, which on an ordinary tick is
false for every entity in the world, and a write whose encoded bytes match what the body already
carries is dropped before `WorldChangeSink.entityEquipmentChanged` hears about it. Over 300 ticks
with 22 armed mobs in view, a real client received four equipment packets, every one of them for a
mob that had just spawned and none for a mob it had already been told about; an unguarded per-tick
write would have sent 13,200, and the same window carried 20,440 movement packets.

`PlayerSession.sendEquipmentFor` is new and serves any entity, where `sendArmorFor` reads a
`Human`'s armor container and so could not serve a mob. `WorldChangeSink` gains
`entityEquipmentChanged`, which every implementer must now answer.
