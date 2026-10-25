---
'@jsprismarine/prismarine': patch
---

Fix armor granting no protection. Reading an item's armor points and toughness matched the
attribute modifier id `minecraft:base_armor`, which no item carries. Java names the armor modifier
after the slot it fills, so an iron chestplate publishes `minecraft:armor.chestplate` and the
lookup found nothing for all 41 armor items. A full diamond set absorbed exactly as much as bare
skin.

Attribute lookups now match on the attribute type alone and sum every `add_value` modifier of it,
so a future rename of Java's modifier ids cannot silently zero a stat again. Attack damage and
durability were already correct and are unchanged.
