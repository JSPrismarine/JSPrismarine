---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Keep a stack's enchantments, durability, name, lore and contents in a block container. `ItemDrop`
was `{ identifier, count }` and a container's slots are drops, so a player who put an enchanted,
damaged or anvil-named pickaxe into a chest got a plain one back. The same drop is what a block
break, a loot roll and a piston move carry, so the loss showed up wherever a stack passed through a
block.

`ItemDrop` now also carries `meta`, `damage`, `customName`, `lore`, `enchantments` and the
`contents` of a container item, and every seam that produces or consumes one carries them with it.
A container block entity writes them into Bedrock's own item compound through
`inventory/itemNbt.ts`, which is now the one statement of that compound: the player codec writes
its stacks through the same module, so a chest and a player's inventory keep the same things and a
chest this server wrote is still a chest a vanilla tool reads. Enchantments go out twice for the
reason the player codec already gave, Bedrock's numbers under `ench` and the Java ids beside them,
because `ench` has no number for Sweeping Edge or for a datapack's enchantment.

A rolled loot stack keeps what Java's table put on it. The three callers that roll a table, a block
break, a mob death and `/loot`, read the id and the count and dropped the data components, so an
enchanted book out of a chest table arrived unenchanted.

A shulker box now survives being broken. It already refused to spill its contents, and kept them
nowhere: the block entity died with the block. The box leaves on the ground carrying its slots,
through the family's own drop and through the `copy_components` in Java's shulker box table alike,
and putting it back down puts the items back in it.
