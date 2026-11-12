---
"@jsprismarine/prismarine": patch
---

Undoing a game mode change on a player in a viewer mode puts that mode back. The logged `abilities.gamemode` went through the command parser on its way back, which turned `SURVIVAL_VIEWER` (3) into spectator and threw on `CREATIVE_VIEWER` (4), stopping the world.
