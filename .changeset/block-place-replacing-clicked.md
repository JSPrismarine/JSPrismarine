---
'@jsprismarine/blocks': patch
---

Add `replacingClicked` to `BlockPlaceEvent` and `BlockPlacementContext`: whether the new block replaced the one clicked, such as short grass, rather than going against its face. It is optional, so a host that does not set it keeps working and has every placement read as a click against the face.
