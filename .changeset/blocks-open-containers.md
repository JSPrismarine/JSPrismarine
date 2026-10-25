---
'@jsprismarine/prismarine': minor
---

Let a block open its container. No block opened a container anywhere in this server before:
`openMainInventory` was the only `ContainerOpen` ever sent, and it answers the client asking for
its own inventory, so a chest, a furnace and a crafting table all did nothing when clicked.

`PlayerSession.openBlockContainer` sends the `ContainerOpen` for a block position with a
`Target Actor ID` of -1, remembers the window, and follows it with the block's stored `Items` for
a container that stores anything. `blockContainerOf` resolves a block identifier to its
`ContainerType` and its slot count, taking the slot count from `slotsOf` in
`@jsprismarine/block-behaviors` rather than keeping a second list of it.

`useItemOnBlock` calls it after the block's `onPlayerInteract` and before the held item's
`onUseOn`, so a barrel still sets `open_bit` and a chest still plays its open sound while both now
also draw their screen. The enchanting table additionally clears its three rows through
`showEnchantingTable` on open.

Twenty-five block families open a screen: chests and trapped chests, the ender chest, barrels,
every shulker box, decorated pots, the crafting table, the three furnaces, the enchanting table,
the three anvils, the brewing stand, the dispenser, the dropper, the hopper, the beacon, the loom,
the grindstone, the stonecutter, the cartography table, the smithing table, the lectern and the
crafter.

The enchanting table and the anvil also take their craft. `ItemStackRequestHandler` resolves
`ENCHANTING_INPUT_CONTAINER`, `ENCHANTING_MATERIAL_CONTAINER`, `ANVIL_INPUT_CONTAINER` and
`ANVIL_MATERIAL_CONTAINER` into two slots held on the open window, so a stack can sit in the table
between the `PLACE` that puts it there and the craft that takes it out, and the request rollback
covers them. A `CRAFTING_RECIPE` while an enchanting table is open is the row the player clicked
rather than a recipe, and runs `takeEnchantingRow`; a `CRAFTING_RECIPE_OPTIONAL` while an anvil is
open runs `takeFromAnvil` with the name out of `Strings To Filter`. Moving a stack into or out of a
*storage* container is still refused.

A craft result that the server built per use is no longer rebuilt from its name on the way to a
slot, which used to be right for the shared creative menu and would have thrown away the
enchantments an enchanting table had just applied. The anvil result also carries its
`minecraft:custom_name` onto the stack, which it had nowhere to put before `Item` grew one.
