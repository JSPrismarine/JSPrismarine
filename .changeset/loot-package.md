---
'@jsprismarine/loot': patch
---

Add `@jsprismarine/loot`, the Java Edition loot table evaluator. It parses a table's pools, entries,
conditions and modifiers once into closures, then rolls them in Java 26.3's order: every pool in
turn, `rolls` plus `floor(bonus_rolls * luck)` draws each, one candidate drawn in proportion to
`floor(weight + quality * luck)`, and each stack through the entry modifier, then the pool modifier,
then the table modifier. All nine `loot_pool_entry_type` members are implemented, including the
`slots` entry 26.3 added alongside the `slot_source` registry.

Draws are reproducible. `random_sequence` seeding follows Java bit for bit, from the world seed
upgraded to 128 bits and exclusive-ored with the MD5 hash of the sequence id, and `LootRegistry`
keeps one advancing stream per id the way Java's `RandomSequences` does. Conditions and item
modifiers come from `@jsprismarine/predicates`, and this package implements the five `ContentView`
members that package left open: smelting results from the pack stack's recipes, nested entry rolls,
the 16 Java dye colors, player profiles and exploration maps.

`LootRegistry` loads tables from a pack stack, resolves references between them, and reports a
reference cycle as a diagnostic rather than recursing. `mapLootToBedrock` translates a result
through an injected lookup that `javaItemToBedrock` satisfies, reporting every reviewed loss and
every unknown identifier instead of dropping either silently.
