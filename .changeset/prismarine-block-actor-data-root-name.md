---
'@jsprismarine/prismarine': patch
---

`BlockActorDataPacket` writes its compound under an empty root name, as the client expects,
even when the `NBTTagCompound` it was given carries a name of its own.
