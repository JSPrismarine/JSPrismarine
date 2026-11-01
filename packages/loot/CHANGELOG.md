# @jsprismarine/loot

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/predicates@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13dfa33`](https://github.com/JSPrismarine/JSPrismarine/commit/13dfa33ec7dc3602ce8c35d8f87067b172da3f26) Thanks [@filiphsps](https://github.com/filiphsps)! - Make a loot table map carry the dialect it is written in, so the two editions cannot be swapped.
  
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1c5b1f5`](https://github.com/JSPrismarine/JSPrismarine/commit/1c5b1f565fc01402dfafa1028455d402e12fd985) Thanks [@filiphsps](https://github.com/filiphsps)! - Report a loot key nothing reads, and read Bedrock's spelling of the grammar.
  
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

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`57d71c3`](https://github.com/JSPrismarine/JSPrismarine/commit/57d71c36dd6b3c5dc78c712fdad70eedc99536f4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/loot`, the Java Edition loot table evaluator. It parses a table's pools, entries,
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a0903e`](https://github.com/JSPrismarine/JSPrismarine/commit/3a0903ec44fb7dde2149ba1b52bbbcb64656c7ed) Thanks [@filiphsps](https://github.com/filiphsps)! - Index the host's recipes once per content options object instead of once per roll.
  
  A loot context carries a content view, and the view has to close over the context it is attached to, so `LootRegistry.roll` builds a fresh one every call. Building one re-indexed every recipe the host had registered, which `furnace_smelt` is the only thing that reads. Over Java's vanilla datapack that walk costs far more than the roll it serves: 421545 draws over the 175 predictable tables took 543 s, against 1.9 s for the same draws with one context per table. Block drops, mob drops and `/loot` all roll through this path.
  
  The index is derived from the recipes and the tag expander alone, so it is now built on first use and cached against the options object that carries them, the way Java's recipe manager indexes once per reload. A host that reloads its recipes hands over the new ones in a new options object, which is what loading a pack stack produces. The same workload now takes 2.5 s, and the draws are unchanged: identical stacks in identical order from the same world seed.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the loot tables reach the player.
  
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.
- Updated dependencies [[`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7), [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701), [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247)]:
  - @jsprismarine/predicates@0.16.0
