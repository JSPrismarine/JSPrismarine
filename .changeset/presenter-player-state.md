---
'@jsprismarine/prismarine': minor
---

`SessionPresenter` gains `showAttributes`, `showMotion`, `showActorData`, `showRespawned` and `showGameRules`, and `ShownDeath` carries `respawnAt`, where the player will come back. `PlayerSession` hands the player's attributes, motion, actor data, death screen, return to life and game rule changes to its presenter instead of sending Bedrock packets itself, and `BedrockPresenter` takes a `BedrockSessionState`, the player's runtime id and the client's last input tick, which those packets carry. A presenter written outside the package has to implement the new methods. `PlayerSession.getLastInputTick` returns that tick.
