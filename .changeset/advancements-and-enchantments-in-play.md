---
'@jsprismarine/prismarine': minor
---

Put the advancement engine and the enchantment system into play. Both packages were built at
startup and then referenced nowhere: no gameplay code raised a single trigger, and nothing read an
enchantment's effect components, so no player could earn an advancement and no enchantment did
anything.

An item stack carries its `minecraft:enchantments` and surfaces it through `getEnchantments`,
`getEnchantmentLevel` and a copying `withEnchantments`; `asPredicateStack` hands that component to
the loot, predicate and enchantment grammars along with the enchantability and durability pair the
enchanting table and the anvil read. `Item.hasEnchantment` takes a Java enchantment id rather than
`ItemEnchantmentType`, whose numbering covers 37 of the 43 enchantments and gives Thorns and
Efficiency the same number.

Damage reduction reads the real `minecraft:damage_protection` components of what is worn, one
running total per equipment slot as Java accumulates it, instead of a factor that was a literal
zero on every entity. Each enchantment decides for itself which blows it answers through the
`damage_source_properties` condition in its own file, so `Damage.BYPASSES_ENCHANTMENTS` is empty:
Java's `#minecraft:bypasses_enchantments` holds only a warden's sonic boom. A melee swing reads the
attacker's main hand for `minecraft:damage` and `minecraft:knockback`, and `Block.getBreakTime`
divides by the tool's mining speed, which carries `minecraft:mining_efficiency`.

Fifteen of the 58 advancement triggers fire from the place that knows the event, led by
`inventory_changed`, which 1914 of the 4045 vanilla criteria use and which is how a block break is
reported, since Java has no block-break trigger. Progress rides in the player data record. The
engine is built with the item and enchantment views its conditions need, and both Java grammars now
parse against a reference resolver, without which a `#tag` inside a criterion expands to nothing.

The enchanting table and the anvil are reachable: Java's draw behind a per-player enchantment seed
that persists, Java's bookshelf walk rather than a radius count, and real options sent as a
`PlayerEnchantOptionsPacket` instead of letting the client's own preview guess.

The content build also passed the item tags where `EnchantmentRegistry` expects the enchantment
tags, and nothing where it expects the item tags, which left `in_enchanting_table` empty and
`supports` false for all 43 enchantments.
