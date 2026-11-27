---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': patch
---

A vanilla Bedrock client can join a server whose addon adds blocks. The item registry now carries an item for every block that `StartGame` declares and that has no item of its own, numbered `255 - block_id` as a Bedrock Dedicated Server numbers it. Before this, the client closed on the resource pack loading screen. `buildItemRegistry` takes the declared blocks as a new `blocks` option, `buildBlockProperties` returns the `block_id` each block got, and `blockItemRuntimeId` is exported.
