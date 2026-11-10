---
"@jsprismarine/prismarine": minor
---

Make every packet handler declare a `lane`: `connection`, `read` or `input`, as ADR 0009 defines them. `PacketHandler` and `ConnectionPacketHandler` now require the property, so a plugin handler that implements either interface has to add it. `appendHandler` gives the merged handler the stricter of the two lanes. No handler runs at a different time yet.
