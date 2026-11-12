---
'@jsprismarine/nbt': patch
---

The NBT reader refuses a byte array, int array or list whose length is negative. A negative byte array length used to move the stream's read index backward, so a crafted item in a player's packet could keep the reader going round the same compound.
