---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/protocol': patch
---

Script music, property overrides, client messages and camera splines now reach the player's client, with the packets a Bedrock Dedicated Server sends. `Player.playMusic`, `queueMusic` and `stopMusic`, and `World`'s, send `LevelEventGenericPacket` music events instead of a sound. `Player.setPropertyOverrideForEntity` and its siblings send `PlayerUpdateEntityOverridesPacket`, `Player.postClientMessage` sends `ScriptMessagePacket`, and `Camera.playAnimation` sends a spline camera instruction. `Camera.playAnimation` refuses a spline with too few control points or key frames that do not start at time 0, and `Player.playMusic` and `queueMusic` refuse a negative fade, with BDS's errors. `@jsprismarine/protocol` now exports `LevelEventGenericPacket` and `PlayerUpdateEntityOverridesPacket`.
