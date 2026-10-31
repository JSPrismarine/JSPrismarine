---
'@jsprismarine/prismarine': patch
---

Stand a player who changes world with their feet at the arrival. `PlayerSession.changeWorld` wrote the arrival, a feet position, as the player's eye position, so a portal trip, a cross-world respawn or `Player.setWorld` left them 1.62 blocks down in the arrival floor. The arrival is raised to the eyes once, and `ChangeDimension` and the closing `MovePlayer` teleport both carry those eyes. `Player.setWorld` now arrives one block above the stored spawn, centered, where a joining player's feet go.
