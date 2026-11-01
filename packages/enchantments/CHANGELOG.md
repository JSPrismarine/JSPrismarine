# @jsprismarine/enchantments

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/predicates@0.17.0

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c2295bc`](https://github.com/JSPrismarine/JSPrismarine/commit/c2295bcc3e0b4d6f0cdfc83646f6ba5b725c846d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/enchantments`, the Java Edition enchantment system. It parses the 26.3
  definition format, implements all 31 effect component types with the 6 value effect types, the 6
  level based value types, the 15 entity effect types and the 16 location based effect types, and
  composes them through `@jsprismarine/predicates` rather than reimplementing its conditions or
  providers. `EnchantmentRegistry` folds a component's value effects over a starting number and hands
  every world change to an injected `EffectSink`, because moving an entity or placing a block belongs
  to the server. The enchanting table and the anvil are ported from `EnchantmentHelper`,
  `EnchantmentMenu` and `AnvilMenu` in the 26.3 server jar, down to the seed-per-row draw and the
  prior work penalty, and `javaRandom` reproduces `java.util.Random` so an offer matches vanilla for
  a given seed. `createEnchantmentView` fills the `EnchantmentView` seam that `apply_bonus` and
  `table_bonus` need, which is the only way `fortune` has any effect at all. `projectToBedrock` maps
  each enchantment through an injected identifier mapper and reports a lore line and a forced glint
  for `sweeping_edge` and any datapack enchantment, whose mechanics run server-side because no packet
  can teach a Bedrock client a new enchantment.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b19ef52`](https://github.com/JSPrismarine/JSPrismarine/commit/b19ef529faf720e9c2b6041ef001037707301679) Thanks [@filiphsps](https://github.com/filiphsps)! - Send a stack's enchantments, custom name, lore and durability to the client. `Item.networkSerialize`
  wrote an empty `ItemInstanceUserData` whatever the stack held, so every enchantment the server
  applied, every anvil rename and every lore line was invisible in the inventory. A player enchanted a
  pickaxe, the mining speed went up, and the item looked exactly as it had before.
  
  The user data compound now carries the durability spent as `Damage`, the name and lore under
  `display`, the enchantments as `ench` with the numbers a Bedrock client knows, and what a container
  item holds as `Items`, which is the preview drawn under a shulker box. The `Items` list is written
  by the storage codec's own `itemSlotsToNbt`, so the preview and the world record cannot drift
  apart. An enchantment
  Bedrock has no number for, which is Sweeping Edge and every datapack enchantment, goes through
  `projectToBedrock`: a lore line above the stack's own lore, and an `ench` entry under an id no
  `EnchantType` has, which makes the client shine the item without printing anything about it. That
  fallback was built and tested in `@jsprismarine/enchantments` and had no call site;
  `projectToBedrock` now also takes an undefined registry, because a stack is drawn on servers that
  loaded no enchantment data.
  
  Loot drops go through `mapLootToBedrock`, which also had no call site. A block break, a mob death
  and `/loot` roll Java's tables, so a dropped `minecraft:spectral_arrow` or
  `minecraft:furnace_minecart` reached the client under a name the Bedrock registry has no item for.
  They now arrive as the reviewed fallbacks, an arrow and a hopper minecart, along with whatever a
  container item holds. An id the pinned Java version does not have is left alone rather than dropped,
  since a Bedrock pack's own table names Bedrock items.
- Updated dependencies [[`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7), [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701), [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247)]:
  - @jsprismarine/predicates@0.16.0
