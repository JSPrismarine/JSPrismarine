# @jsprismarine/predicates

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Patch Changes

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix four item modifier defects and match the `food` member of a player sub-predicate. Each one was
  checked against the unobfuscated Java 26.3 server jar.
  
  - `set_lore`, `set_written_book_pages` and `set_writable_book_pages` read the list operation mode
    from their own members. `ListOperation.codec` is a `MapCodec` that dispatches on a flat `mode`
    key, so these three modifiers carry `mode`, `offset` and `size` beside `lore` or `pages`. The
    parser was handing `listOperation` the value of `mode`, which then looked for a second `mode`
    inside it and fell back to `replace_all`. Every `append`, `insert` and `replace_section` use
    silently replaced the whole list instead.
  - `insert` and `replace_section` leave the list unchanged when the offset is past its end, and
    `replace_section` without a `size` takes out as many entries as it puts in. The size previously
    defaulted to zero, which turned that form into an insert.
  - `set_fireworks` reads its explosions from `explosions.values`. The `explosions` member is a
    `ListOperation.StandAlone`, so the list and the mode live inside it. The modifier read
    `explosions` as the list itself, which yielded nothing and cleared the component. An absent
    `explosions` member now leaves the existing explosions alone instead of clearing them.
  - `furnace_smelt` multiplies the input count by the count the recipe yields and clamps the result
    to the stack size, which is what `SmeltItemFunction.run` computes. The count the recipe yields
    was dropped, so a recipe that produces more than one item smelted too few.
  - The `food` member of `minecraft:type_specific/player` matches Java's `FoodPredicate`: an int
    bound on the food level and a float bound on the saturation. Both read the new `food` member of
    `EntityView`, and a view that does not report hunger makes the predicate fail with a diagnostic.
    The vanilla `lunge` enchantment uses this member, and the parser used to warn and refuse it.
  
  `advancements`, `recipes`, `stats` and `input` on the player sub-predicate still warn. They need
  per-player progression and client input state, which no host seam in this package exposes, and no
  vanilla file uses them.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/predicates`, the Java Edition predicate, item modifier and value provider
  evaluator that loot, advancements and enchantments call. It implements the 20 loot condition types,
  42 loot function types, 23 int and 28 float context providers, 7 enchantment level based values and
  23 of the 25 entity sub-predicate types of Java 26.3, all read out of the 26.3 server jar. One
  helper resolves 26.3's composition rule, where every field of a composable type takes an inline
  value, a namespaced id, a list mixing both, or a `#tag`. A `PredicateContext` carries the 16 loot
  context parameters and declares which of the 31 context key sets it belongs to, so reading a
  parameter that set does not provide reports a diagnostic instead of quietly passing. The random
  source, reference resolver, level view, item stack operations, enchantment view and content view
  are all injected, and a grammar member the package does not implement reports a diagnostic and
  evaluates false rather than throwing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.
