---
'@jsprismarine/prismarine': patch
---

Block changes broadcast to clients now carry the `Network` flag in `UpdateBlockPacket`, as a
Bedrock Dedicated Server does, instead of no flags. `UpdateBlockPacket.flags` and `.layer`
default to `None` and `Normal` rather than being left undefined.
