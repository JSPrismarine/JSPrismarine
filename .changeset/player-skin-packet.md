---
'@jsprismarine/prismarine': patch
---

`PlayerSkinPacket` now decodes and encodes the full protocol 2193 layout (`UUID`, `SerializedSkin`, the two localized skin names) through the new `Skin.networkDeserialize`, and the handler stores the new skin on the player and forwards the packet to every other online player. The packet's `trusted` field is gone; the flag lives inside the skin as `Skin.isTrusted`.
