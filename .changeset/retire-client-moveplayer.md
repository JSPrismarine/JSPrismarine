---
"@jsprismarine/prismarine": minor
---

A client's `MovePlayerPacket` no longer moves its player. The packet moved a player only in the movement mode Mojang deprecated in protocol 800 (1.21.80) and removed in protocol 818 (1.21.90), so no client of a supported protocol sends it for that. The server decodes it and drops it with a debug log line. A third-party client or bot that moved with `MovePlayerPacket` must send `PlayerAuthInputPacket` instead, and set `HandledTeleport` in its first input after a server teleport. `applyClientMovement`, `ClientMovement` and `MovementContext` moved from `network/handler/MovePlayerHandler` to `network/handler/PlayerAuthInputHandler`, and `ClientMovement` lost its `mode` field. The server still sends `MovePlayerPacket` to clients.
