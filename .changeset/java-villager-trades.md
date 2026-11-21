---
'@jsprismarine/trading': patch
'@jsprismarine/loot': patch
'@jsprismarine/prismarine': patch
---

Villagers and wandering traders draw their offers from Java's `trade_set` and `villager_trade` registries, as Java's `Villager.updateTrades` and `VillagerTrade.getOffer` do, so the offers, prices, uses, experience and price multipliers are Java's. `@jsprismarine/trading` adds `@jsprismarine/trading/javaTrades` and lets a `Merchant` take any `OfferSource` in place of a Bedrock table. `LootRegistry` gains `itemModifier`, `predicate` and `context`, which compile and run Java grammar that lives outside a loot table.
