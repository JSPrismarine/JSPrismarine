---
'@jsprismarine/prismarine': patch
---

`SetLocalPlayerAsInitializedPacket` now encodes as well as decodes, so a client built on the package can send it. Its JSDoc lists the protocol 2193 layout: `Player ID` as one varuint64.
