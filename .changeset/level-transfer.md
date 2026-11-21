---
'@jsprismarine/prismarine': patch
---

Players move between levels with their records. `transferToLevel` saves the player's record in the level they leave, puts their record in the level they arrive in on them, or a fresh one at its spawn when they have never been there, and gives their client that level's game rules, clock, weather, custom dimensions and scoreboard. A player who logs out in a level other than the entry level comes back in it, which `player-levels.json` records. Scoreboard packets go to the players of the scoreboard's level only. Detaching a level and `/debug changeWorld` move players this way.
