---
'@jsprismarine/prismarine': minor
---

Model block entities, and give entities a form they can be stored in.

`packages/prismarine/src/blockentity/` is new: a `BlockEntity` base, a registry that mirrors `entity/Entities.ts`, and classes for chests, barrels, shulker boxes, hoppers, furnaces, signs, skulls, beds, banners, item frames and mob spawners. `Chunk` holds them, keyed by position, and drops one when the block it belonged to is replaced, so a broken chest cannot leave an orphan tile behind. `EntitySerializer` and `GenericEntity` do the same job for actors.

Both follow one rule, and it is the whole design: reading keeps the *entire* source compound, a class lifts out only the fields it models, and writing starts from what is left and puts those fields back. A type nobody has modelled becomes the generic form, whose remainder is everything, and round-trips byte for byte.

That is not tidiness. A world is full of blocks and mobs written by versions and behaviour packs this server knows nothing about, and a provider that wrote back only the fields it understood would erase a player's chests one save at a time with nothing to say it had happened. For actors it is stricter still: vanilla NBT carries a `definitions` list naming the component groups the actor was assembled from, and one saved without it comes back broken.

A sign is read in both the flat pre-1.19.80 shape and the current front-and-back-face one.
