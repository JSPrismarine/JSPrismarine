---
'@jsprismarine/prismarine': patch
---

`StartGame` now tells the client the server has not enabled client-side chunk generation, so a 1.26.51 client no longer generates vanilla terrain for chunks the server has not sent. The off-hand item goes out in a `MobEquipment` packet for the offhand container instead of `MobArmorEquipment`'s body armor slot. `ClientConnection.disconnect` takes a `DisconnectReason` code, defaulting to `DISCONNECTED`; `Player.kick` sends `KICKED` and the server shutdown sends `SHUTDOWN`. `AddPlayer` carries the player's build platform, permission levels, and platform chat id.
