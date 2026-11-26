---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

Bedrock clients now download the installed addons' resource packs when they join. The login lists each pack in `ResourcePacksInfoPacket`, a request for packs gets a `ResourcePackDataInfoPacket` per pack, each chunk request gets its `ResourcePackChunkDataPacket`, and the pack stack lists the packs top first, each above the packs it depends on. The new `texturepack-required` setting, off by default, makes players take the packs to join. `@jsprismarine/protocol` exports `ResourcePackChunkDataPacket` and `ResourcePackDataInfoPacket` from their own subpaths.
