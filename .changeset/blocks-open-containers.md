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

Moving a stack into or out of a block container is still refused: `ItemStackRequestHandler` only
resolves the player's own containers, the cursor, the crafting grid and the armor slots.
