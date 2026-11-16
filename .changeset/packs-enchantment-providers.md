---
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
---

The pack loader routes `data/<ns>/enchantment_provider/` into `Definitions.enchantmentProviders`, the registry Java's `EnchantmentHelper.enchantItemFromProvider` reads to enchant a mob's spawn gear. The composed vanilla prefix cache moves to v10, since a v9 cache holds no such registry.
