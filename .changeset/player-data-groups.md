---
'@jsprismarine/prismarine': patch
---

`player-data-groups` in `config.json` groups levels whose players share parts of their record: each group lists its levels and the parts they share, from `inventory`, `armor`, `offhand`, `enderChest`, `health`, `hunger`, `experience`, `gamemode`, `abilities`, `spawnPoint` and `position`. A player moving between two levels of a group takes those parts along, and every other part stays with each level.
