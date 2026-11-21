---
'@jsprismarine/prismarine': minor
---

What produced a player's move is now a `MoveMode` string (`normal`, `respawn`, `teleport` or `headRotation`) in place of Bedrock's `PositionMode`. `PlayerSession.setPlayerPosition`, `PlayerSession.sendMove` and `PlayerMoveEvent` take and return it. The session's presenter sends the move.
