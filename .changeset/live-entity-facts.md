---
'@jsprismarine/prismarine': patch
---

Read an entity's stats off the components it has now. `EntityFacts` came from one throwaway
instance built from a type's base components, so a stat a component group carries read as zero.
Fifteen vanilla types - `slime`, `magma_cube`, `sulfur_cube`, `zombie`, `husk`, `zombie_villager`,
`zombie_villager_v2`, `zombie_nautilus`, `nautilus`, `enderman`, `piglin`, `hoglin`, `creaking`,
`armadillo` and `happy_ghast` - declare `minecraft:movement` only in a group their spawn event
adds, so `MobBody.step` scaled by a speed of zero and returned before moving anything. The most
common hostile mob in the game had been standing still.

`MobBody.facts` now reads through to the entity's active components, falling back to the type's
figure, from the moment `DataEntity` pairs a body with its instance. The same defect was under
seven other facts: of the 128 vanilla entity files, 18 declare `minecraft:attack` only in a group,
29 `minecraft:loot`, nine `minecraft:type_family`, six `minecraft:collision_box`, five
`minecraft:health`, three `minecraft:knockback_resistance` and three
`minecraft:underwater_movement`. So eighteen types dealt no melee damage, a rabbit collided as a
full block, and only `minecraft:follow_range` was never affected.

Answer a config question before `enable` has run. Every field `Config.enable` fills was declared
with a definite-assignment `!`, so a subclass that stubs `enable` had an undefined `difficulty`:
`getDifficulty` threw partway through the join burst and left the client waiting at
`AWAITING_SPAWN` for packets that never came. The fields now start at the same defaults `enable`
reads, from one table so the two cannot drift.
