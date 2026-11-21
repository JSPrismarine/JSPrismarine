---
'@jsprismarine/predicates': patch
'@jsprismarine/prismarine': patch
---

Follow Java's `enchant_randomly` and `enchant_with_levels`: a book becomes an enchanted book that keeps its enchantments as `minecraft:stored_enchantments`, an enchantment already on the stack keeps the higher level, and in a villager trade's context the functions write the `minecraft:additional_trade_cost` Java adds to the price. Add the `minecraft:villager/variant` data component predicate, which a trade's `merchant_predicate` uses to pick offers by the villager's biome type. A looted enchanted book reaches the item it drops with its stored enchantments.
