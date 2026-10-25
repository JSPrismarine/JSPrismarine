---
'@jsprismarine/enchantments': patch
---

Add `@jsprismarine/enchantments`, the Java Edition enchantment system. It parses the 26.3
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
