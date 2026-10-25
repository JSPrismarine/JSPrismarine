---
'@jsprismarine/predicates': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/loot': patch
---

Make the loot tables reach the player.

A generated container's loot is rolled the first time it is opened. A structure writes a chest
with a `LootTable` tag, a `LootTableSeed` and nothing in it, which is what the game writes too,
and nothing rolled them: every chest in a village, a shipwreck, a mineshaft, a stronghold, a
desert pyramid or a buried treasure opened empty. The fill is Java's `LootTable.fill` step for
step over one `java.util.Random` seeded with the stored seed, so the table is rolled, the free
slots are shuffled, the stacks of more than one are split over them, and each one is dealt off
the back of the shuffled list. Two players in two copies of one world see the same chest. The tag
goes with the write, so the second open shows the first open's chest rather than a second roll.

`LootRegistry` answers three of its content seams out of the pack stack it already holds: the
smelting recipes `furnace_smelt` smelts through, the item tag expansion a tagged ingredient needs,
and the reference resolver a `set_contents` entry list parses against. It takes two more from the
host, because neither is in a pack: the enchantment view the 25 tables carrying `enchant_randomly`
or `enchant_with_levels` draw from, built per roll over the table's own stream so a world seed
replays the draw, and the per-item stack limits a rolled count is clamped to. The server passes
both. `exploration_map` stays unanswered, because it needs a structure search this server has not
got.

`furnace_smelt` reads `use_input_count` with Java's own default of true. Reading it as false cut
every smelted drop to one, so a cow that died burning gave one cooked beef where Java gives the
one to three its `set_count` rolled.
