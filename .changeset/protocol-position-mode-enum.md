---
'@jsprismarine/protocol': minor
---

Rename the `MovementType` enum to `PositionMode`, the name the Bedrock docs give the Position Mode byte of `MovePlayerPacket`. Its members `Reset` and `Pitch` are now `Respawn` and `OnlyHeadRot`, matching the docs. Values are unchanged.
