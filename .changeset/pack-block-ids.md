---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': patch
---

A pack's blocks are numbered the way a Bedrock Dedicated Server numbers them. `buildBlockProperties` takes a `fromPacks` option that ignores each block's `internal_vanilla_data` and numbers every block from 10000, as that server does for a pack's blocks, and the server's join payloads set it. A pack can no longer move its blocks onto a vanilla block's id or past the item ids the registry can carry. `blockItemRuntimeId` now wraps an item id past the int16 range the way that server does. `buildItemRegistry` gives no item to a block whose item id another item already has, and lists it in a new `unnumberedBlocks` result. An invented item's id now skips every id already in use. The server's startup line counts the blocks left without an item.
