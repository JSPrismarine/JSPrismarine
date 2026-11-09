---
'@jsprismarine/prismarine': minor
---

`Player.setPosition` now takes the same options as `Entity.setPosition`, the new exported `EntityPositionOptions`. The movement mode and the broadcast flag moved to `Player.setPlayerPosition(options, broadcast)`, so replace `player.setPosition({ position, type }, false)` with `player.setPlayerPosition({ position, type }, false)`.
