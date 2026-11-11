---
"@jsprismarine/prismarine": minor
---

Breaking: `BossBar.addPlayer`, `BossBar.removePlayer` and `BossBar.answerQuery` take the player's `PlayerSession` only. They no longer accept a `Player`; pass `player.getNetworkSession()` instead. `bar.players()` already returned sessions.
