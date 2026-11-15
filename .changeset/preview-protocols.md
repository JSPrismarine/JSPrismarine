---
'@jsprismarine/protocol': patch
---

Support one Minecraft Preview protocol alongside the released ones. A `ProtocolVersionDefinition` and its codec can set `preview`, and `ProtocolCodecRegistry` gains `advertisedCodec`, the newest release. The registry refuses more than one preview, or a preview older than a release.
