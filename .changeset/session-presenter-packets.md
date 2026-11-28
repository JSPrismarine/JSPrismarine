---
'@jsprismarine/prismarine': minor
---

`PlayerSession` builds no Bedrock packet any more. `SessionPresenter` gains `showSpawned`, `showCredits` and `showCommands`, which take the join's spawn status, the End's credits and `AvailableCommands` off the session; the session still decides which commands a player is offered. `PlayerSession.sendPlayStatus` is removed: the login handler writes its `PlayStatus` itself. A Java client is sent neither credits nor a command tree yet, as before.
