---
'@jsprismarine/prismarine': patch
---

`UpdateAttributesPacket` now carries the `PlayerInputTick` the protocol docs ask for: the tick of the client's last handled `PlayerAuthInputPacket` for its own attributes, and zero for other entities. It used to send the server's tick counter. `PlayerSession.recordInputTick` stores the client's tick.
