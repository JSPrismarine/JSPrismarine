---
'@jsprismarine/prismarine': minor
---

Give behavior pack scripts titles, sounds, particles, status effects and block containers. A script's title, subtitle and action bar reach the player as `/title` sends them, its sounds and particles go out as `/playsound` and `/particle` send them, and its effects are added and taken off as `/effect` does. A chest, a barrel or any other block that stores items has an inventory a script reads and fills, an item stack's damage reaches its durability component, and setting `isSneaking` makes a player sneak. GameTest simulated players use items and break blocks.

The server raises four new events. `playerBreakBlock` comes before a player's break and can cancel it, and `playerBlockBroken` follows a break that went on; `playerUseItem` comes before a player uses an item on nothing and can cancel it, and `playerItemUsed` follows a use that went on. The level's scripts hear them as `world.beforeEvents` and `world.afterEvents` `playerBreakBlock` and `itemUse`.
