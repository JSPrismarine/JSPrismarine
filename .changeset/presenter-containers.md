---
'@jsprismarine/prismarine': minor
---

A block's or a trader's screen reaches its client through the session's presenter: `SessionPresenter` gains `openContainer`, `showTradeOffers`, `showContainerData` and `showContainerSlots`, which `BedrockPresenter` sends as `ContainerOpen`, the block's contents, `UpdateTrade`, `ContainerSetData` and `InventorySlot`. `PlayerSession` keeps the window it opened and what the client already has, and sends no container packet itself. `PlayerSession.sendContainerSlot` is gone; Bedrock's handlers send the slot through `sendContainerSlot` in `editions/bedrock/containerSlot`.
