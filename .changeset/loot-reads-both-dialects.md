---
'@jsprismarine/loot': minor
'@jsprismarine/prismarine': minor
---

Report a loot key nothing reads, and read Bedrock's spelling of the grammar.

A loot table is gated data, and this evaluator skipped a key it had no case for without a word. A
gate nobody reads is a gate that passes, which is the wrong direction for loot to fail in. Handed
`zombie_equipment.json` whole it armed 2000 zombies of 2000, because every gate in that file sits
in a plural `conditions` array that only Bedrock writes and only Java's singular `condition` was
read. A condition type the grammar could not compile failed the same way: it dropped out of 26.3's
and-fold, so a field holding one unimplemented condition folded to an empty and and passed.

Both now report. An unknown key is an error, because its effect is unknown; a key this package
names and leaves alone is a warning, because its effect is not. An error raised while compiling a
condition field closes that gate for good, at the pool and at the entry alike. The table still
rolls what it could read, so one stray key does not empty a chest, and `strict` turns the errors
into a `LootGrammarError` for a host that would rather refuse. Vanilla's 1447 Java tables report
nothing at all, which is what keeps the rule honest.

`dialect: 'bedrock'` then reads the spelling the behavior packs use: the plural `conditions` array
whose members name their type in a `condition` key, the `tiers` ladder ten pools draw from, the
`pools` an entry nests under itself, and a `loot_table` entry naming a pack-relative path. Three
conditions are implemented, the three those tables gate on, and the other twelve report and close
their gate. `tiers` reproduces Java's `Mob.populateArmor`. The two difficulty-scaled conditions
read an injectable `LootDifficultyView`, defaulting to normal difficulty in a fully ramped region
so a table's stated `max_chance` is its real chance. Java's path is untouched and stays the
default.

`prunedEquipmentTables` is gone from `@jsprismarine/prismarine`. It dropped every pool the
evaluator could not gate, which left 13 of the 18 vanilla equipment tables with their signature
weapon and nothing else, and zombies wearing nothing at all. The equipment registry now reads the
tables whole in the Bedrock dialect. Measured against a built vanilla stack: a zombie arms 98 times
in 2000 against the table's stated 0.05, wears a helmet 299 times against its stated 0.15, and all
18 tables a `minecraft:equipment` component names roll something and compile with no error. Of the
15 vanilla types that carry the component, the four whose only pools were gated ones go from never
holding anything to their stated rates: the fox to 18.9 percent, the drowned to 12.6, the husk to
19.0 and the zombie to 20.8.

The one member of the Bedrock grammar still not applied is `functions`, so rolled gear arrives
unenchanted. It reports a warning per occurrence rather than going quiet, which is the whole point
of the first half of this change.
