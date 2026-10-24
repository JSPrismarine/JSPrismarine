---
'@jsprismarine/protocol': patch
---

`ItemRegistryPacket` serializes as well as deserializes, through the `ItemData` structure, and each `ItemRegistryEntry` carries its `Item Component Data` compound. It used to throw on serialize and drop the compound on read.
