---
'@jsprismarine/prismarine': patch
---

`ResourcePackChunkRequestHandler` now disconnects a client that asks for a resource pack chunk,
with the resource pack disconnect reason, instead of logging the request and leaving the client
on its download screen. The server serves no packs, so no requested chunk exists.
`ResourcePackType` gains the `Invalid = 0` member from Mojang's `PackType` enum.
