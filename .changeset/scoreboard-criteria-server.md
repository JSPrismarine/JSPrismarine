---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

The scoreboard raises a player's score for the statistics and criteria Java raises it for. `minecraft.custom:minecraft.play_time`, `total_world_time`, `time_since_death`, `sneak_time` and `time_since_rest` count up each tick. A death counts toward `deaths` and `deathCount`, and a player's kill toward `totalKillCount`, `playerKillCount`, `player_kills`, `mob_kills`, `minecraft.killed:<entity>` and `minecraft.killed_by:<entity>`. `health`, `food`, `air` and `level` follow the player's readings. A joining Bedrock or Java player is shown the level's display slots, which before this showed only after a move between levels. An objective's display name is read as a text component. `@jsprismarine/protocol/java/versions/newest` adds `CUSTOM_STATS` and `STAT_TYPES`, `JavaRegistry` gains `entries` and `JavaBlockStates` gains `blocks`.
