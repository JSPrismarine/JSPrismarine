---
'@jsprismarine/prismarine': patch
---

Write a `CompoundTag` entity data item as network NBT. `Metadata.networkSerialize` threw for a `FlagType.ITEM` entry; it now writes the compound in little-endian NBT with varint lengths, as the `DataItemCompoundTagPayload` docs ask for. The entry layout is unchanged: id, the one-of selector as a varuint, the same type as a byte, then the value.
