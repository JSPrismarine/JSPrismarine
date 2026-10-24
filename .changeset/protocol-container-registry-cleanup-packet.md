---
'@jsprismarine/protocol': patch
---

Add `ContainerRegistryCleanupPacket` (id 317) and the `FullContainerName` structure it lists: a `ContainerUiId` byte, then an optional `Dynamic ID` written as a presence byte and a little-endian uint32.
