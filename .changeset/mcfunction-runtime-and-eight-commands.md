---
'@jsprismarine/packs': minor
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': minor
---

Run real mcfunctions, and wire eight more of the vanilla commands.

`@jsprismarine/mcfunction` was complete, tested and connected to nothing. `/function` existed in
the command tree, its host verb refused, and no package depended on the runtime. The two halves
are joined now. `@jsprismarine/packs` routes a datapack's `.mcfunction` files into a new
`functions` registry, the one registry whose `data` is text rather than parsed JSON, and the
server compiles them, resolves function tags through the merged tag table, and runs every line
through the Brigadier dispatcher with the source made silent, as Java does.

That makes eight things work. `/function`, `/function #tag`, a macro call with an SNBT argument
compound, `/schedule function ... [append|replace]`, `/schedule clear`, `#minecraft:load` once
after the packs load, `#minecraft:tick` once a tick, and `/execute as @e[...] run function`, which
forks the way the rest of an `/execute` chain does. Vanilla ships no functions in either edition,
so this buys no parity. It is what a third-party Java datapack needs.

Seven more commands this server used to hold back now run. `/scoreboard` keeps objectives, scores
and the three display slots, which `execute if score`, `execute store result score` and a
selector's `scores=` all read. `/random` draws from the Xoroshiro128++ stream
`@jsprismarine/loot` already reproduces for a table's `random_sequence`, so a sequence shared with
a loot table is one stream. `/xp` reads and writes the two bar attributes through Java's curve and
gains the `set` form. `/enchant` puts the level on the held stack. `/loot` rolls Java's tables, and
its `kill` and `mine` sources roll the table of the entity or block they point at rather than one
the player typed. `/recipe` unlocks out of the compiled recipe book over a new
`UnlockedRecipesPacket`. `/loot` and `/recipe` are offered only when `content-packs` is on, because
without the pack stack there is nothing for either to work from.

Breaking in `@jsprismarine/commands`: `runLoot` replaces `DataCommandHost.runLootTable` and takes
a `LootSource` model rather than a table id, because only one of `/loot`'s four sources names a
table at all. `ScoreboardCommandHost` gains `holders`.
`EntityCommandHost.changeExperience` takes the `add` or `set` mode. `/scoreboard players`,
`execute if score` and `execute store ... score` read Java's `ScoreHolderArgument`, which is a
selector, a bare name, or `*`, instead of an entity selector, so a fake player parses.
