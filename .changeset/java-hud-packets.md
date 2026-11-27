---
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

Add Java Edition's title, scoreboard and tab list game mode packets to `@jsprismarine/protocol/java/packet/play`:

- `SetTitleText`, `SetSubtitleText`, `SetActionBarText`, `SetTitlesAnimation` and `ClearTitles`.
- `SetObjective`, `SetDisplayObjective`, `SetScore` and `ResetScore`, with the blank and fixed number formats.
- `PlayerInfoUpdateGameMode`, a `Player Info Update` that carries each player's game mode.

Reading an objective method that Java 26.3 does not define throws `JavaObjectiveMethodUnknown`. Reading the styled number format, which this server does not read, throws `JavaNumberFormatUnread`.
