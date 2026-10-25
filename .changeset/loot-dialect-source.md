---
'@jsprismarine/loot': minor
'@jsprismarine/prismarine': minor
---

Make a loot table map carry the dialect it is written in, so the two editions cannot be swapped.

A datapack's tables and a behavior pack's tables are both `ReadonlyMap<string, unknown>`, and the
dialect was a separate option stated beside the map. Nothing checked the two agreed, and one caller
had them wrong: the Bedrock map went into a field named `lootTablesJava`, with a `dialect:
'bedrock'` written six lines away as the only thing keeping it right. `LootTableSource` pairs the
map with its dialect, built by `javaLootTables` or `bedrockLootTables` and by nothing else;
`LootPackDefinitions.lootTablesJava` becomes `lootTables`, which takes a source, and
`LootRegistryOptions.dialect` is gone. The old line is now a compile error rather than a silent
behavior change. `LootRegistry` gains `dialect` and `findings`, the diagnostics with each
attributed to the table it came from.

The Bedrock dialect reads four more things it was reporting as errors: the untyped `{ "min": 2,
"max": 4 }` range, which is Java's uniform provider with the type left off; an item entry's `count`,
where Bedrock states what Java states with `set_count`, producing nothing when the count rolls zero;
a `loot_table` entry naming its target without the `.json`, which vanilla writes both ways; and a
pool written `{}`, which `armor_stand.json` and `boat.json` use to mean a table that produces
nothing on purpose.

What is left is reviewed rather than counted. `BEDROCK_REVIEWED_CONDITIONS` names the twelve
condition types that read an entity or a biome a roll here has no handle on, and
`BEDROCK_REVIEWED_FUNCTIONS` the nineteen item functions, each saying what a result comes out as
without it. A listed one warns, a listed condition still closes its gate, and anything unlisted is
an error, which is the rule the unread-key report already applied. Over all 309 vanilla Bedrock
tables that is 1484 warnings and no errors, so a strict build can refuse a pack carrying something
new without refusing a stock server.

`content-strict` reaches both registries, which the server now builds at the composition root:
`ServerContent.equipmentLoot` holds the Bedrock one, replacing the `equipmentRegistry` lookup in
`entity/equipment.ts`. Both are compiled whole during the content build rather than at the first
chest, their findings reach the content report under `loot.invalid` and `loot.unapplied` with the
pack and file named, and the startup line states what compiled and what went unapplied.
