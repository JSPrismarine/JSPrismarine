---
'@jsprismarine/prismarine': patch
'@jsprismarine/enchantments': patch
---

Send a stack's enchantments, custom name, lore and durability to the client. `Item.networkSerialize`
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
