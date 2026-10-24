---
'@jsprismarine/prismarine': patch
---

`MovePlayerPacket` and `SetActorMotionPacket` now carry the `PlayerInputTick` the protocol docs ask for: the tick of the client's last handled `PlayerAuthInputPacket` when the packet is about the receiving player, and zero when it shows them another player. Both used to send the server's tick counter, which the client cannot match against its prediction history. The server also reads a server-bound `MovePlayerPacket`, which at protocol 2193 only the bot harness sends, on the docs' terms: it must name the sender's own runtime id in Normal or OnlyHeadRot mode, and anything else is dropped.
