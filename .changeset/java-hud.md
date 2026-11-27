---
'@jsprismarine/prismarine': minor
---

A Java Edition player sees titles, subtitles, the action bar and the scoreboard, and its tab list shows each player's game mode. The session presenter gains `showTitle`, `showDisplaySlot`, `showScore` and `removeObjective`, which `/title`, `/titleraw`, the scripts' `ScreenDisplay`, the scoreboard's commands and a player's arrival in a level now go through instead of sending Bedrock packets. A Bedrock client gets the same `SetTitle`, `SetDisplayObjective`, `SetScore` and `RemoveObjective` packets as before. A Java client gets Java's title packets, with a `rawtext` title read for its text, and Java's objective, display slot and score packets, with the objective added before a slot shows it and taken off once no slot does. `JavaPresenter.sendPlayerGameMode` updates a listed player's tab list entry, and a player comes into the tab list with its game mode.

Breaking: `SessionPresenter` gains four required methods, so a presenter written outside this package has to implement `showTitle`, `showDisplaySlot`, `showScore` and `removeObjective` to type-check.
