---
'@jsprismarine/prismarine': minor
---

Let a player move stacks through a block's own slots. Opening a chest already worked and showed
what was in it; nothing could put anything in or take anything out, because
`ItemStackRequestHandler` owned the player's containers and the two slots a workstation keeps on
the open window, and a chest's 27 were neither.

`inventory/containerSlots.ts` maps the `Container Name` on an `ItemStackRequest` onto a block
slot. A storage screen names its whole range under one container and numbers the slots inside it;
a furnace gives each of its three slots a container of its own; a brewing stand's five are three
bottles, then the ingredient, then the fuel. The block slot numbering is Bedrock's own, so the
`Items` list a vanilla tool reads is in the order vanilla writes it.

`inventory/containerStore.ts` is where those slots live, which is the chunk's own block entity for
every block but one. A request reads the container once, moves stacks around in that array and
writes it back only when the request is accepted, so a refusal leaves the block holding what it
held and two players at one chest each start from what is in it now. The exception is the ender
chest, whose 27 slots come off `HumanInventory.getEnderChest` and belong to the player.

`TAKE`, `PLACE`, `SWAP`, `DROP` and `DESTROY` all reach a block's slots. `SWAP` used to read both
ends as inventory indices and refuse anything else; it now locates both the way a move does, so a
stack can trade places with one in a chest. A furnace's output slot refuses anything dropped onto
it and still gives its stack up, which is Java's rule for it.

A double chest is one run of 54 slots across the two block entities the `jsprismarine:container`
family paired, ordered from the half with the lower `x` and then `z`, so the player who opened the
left chest and the player who opened the right one address the same slots. Every other player with
the same block open is sent an `InventorySlot` for each slot that moved, through the new
`PlayerSession.sendContainerSlot`.

Known gaps. A block entity carries an identifier and a count per slot, so a stack put into a chest
keeps its name and how many there are and loses its enchantments, its damage and any name an anvil
gave it. Nothing smelts in a furnace, brews in a brewing stand or moves items on a hopper's timer,
so those blocks are storage with the right slot layout and no process behind them.
