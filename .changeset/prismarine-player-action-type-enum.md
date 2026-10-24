---
'@jsprismarine/prismarine': minor
---

Rename the `PlayerAction` enum exported from `network/packet/PlayerActionPacket` to `PlayerActionType`, the docs' name. Members now carry the docs' names in PascalCase: `START_BREAK` is `StartDestroyBlock`, `JUMP` is `StartJump`, `BUILD_DENIED` is `DenyDestroyBlock`, `CREATIVE_PLAYER_DESTROY_BLOCK` is `CreativeDestroyBlock`, `DIMENSION_CHANGE_ACK` is `ChangeDimensionAck`, `START_SPRINT` is `StartSprinting`, and so on for every member. Values are unchanged.
