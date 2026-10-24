---
'@jsprismarine/prismarine': patch
---

Write `AvailableCommandsPacket` fields at the widths the protocol 2193 docs give: `Flags` as an unsigned 16 bit integer and a constraint's `Enum Value Symbol` and `Enum Symbol` as unsigned 32 bit integers. An `Enum Data` entry now writes the number of indices it actually contains, and an enum that only a constraint names is added to the enum table so the constraint's symbols point at an entry that exists.
