---
'@jsprismarine/script-host': patch
---

Implement `@minecraft/server`'s block volumes, `BlockBoundingBoxUtils`, `BlockVolume`, `ListBlockVolume` and their `BlockLocationIterator`, with the corner rounding, walk order and closest-block order the pinned Bedrock Dedicated Server gives.

Implement the block, item and container members the pinned server answers from its registries: `BlockTypes`, `BlockStates`, `ItemTypes`, `EnchantmentTypes` and `Potions`; a block's neighbors, tags, localization key, item, liquid answers, light, `isSolid`, `getMapColor`, `getParts`, `trySetPermutation` and components; `BlockPermutation.withState` and `matches`; an item stack's type facts, weight, block lists, lock, `clone` and `isStackableWith`; the enchantable, food, cooldown, compostable, dyeable, potion, book and block dynamic property item components; the movable, map color, precipitation and vibration block components; and `Container`'s `find`, `contains`, `moveItem`, `swapItems`, `transferItem`, `clearAll` and `weight`, with `ContainerSlot`'s stack members. The `block-volumes`, `block-members`, `item-members` and `containers` parity scenarios recorded each on BDS.

`ScriptWorld` gains an optional `catalog` of the game's types, and optional `blockLight`, `waterlogged`, `setWaterlogged` and `redstonePower`. `ScriptItem` gains optional block lists, lock, keep-on-death, enchantments, data value, book, dye color, unbreakable flag and block properties.
