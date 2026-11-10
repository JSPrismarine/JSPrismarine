---
"@jsprismarine/prismarine": patch
---

Build and load the saved player record in one place, from a live player or a store player. `playerRecordFrom` projects the record from a player's state and `applyPlayerRecord` puts one back, both through structural ports that a live `Player` satisfies and that `StorePlayer` satisfies over the `minecraft:player` entity in the entity store. The record is unchanged byte for byte. Its spawn point is now a copy, so a record shares no object with the player it was built from.

New API: `playerRecordFrom`, `applyPlayerRecord` and `recordedPosition` in `world/playerRecord`, `StorePlayer` in `entity/storePlayer`, and `Player.restoreHealth` and `Player.restoreFlying`.
