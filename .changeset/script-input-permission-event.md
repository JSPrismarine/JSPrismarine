---
'@jsprismarine/script-host': patch
---

`world.afterEvents.playerInputPermissionCategoryChange` can be subscribed to, and fires in the next script flush when `Player.inputPermissions.setPermissionCategory` changes a category, with the category, whether it is enabled and the player, as on a Bedrock Dedicated Server. Setting a category to the value it already has raises nothing and sends the client nothing.
