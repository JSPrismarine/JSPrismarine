---
"@jsprismarine/prismarine": patch
---

A `MovePlayerPacket` sent after a server teleport is held by the same rule as an input: its position is ignored until an input carries `HandledTeleport` at the target, or the hold times out. A move the client sent before the teleport is applied in the next input step, after the teleport, and moved the player back. The chunks queued for the target then went out under a publisher update centered on the old spot, so the client dropped them while the server counted them as sent.
