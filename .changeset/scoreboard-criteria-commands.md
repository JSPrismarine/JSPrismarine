---
'@jsprismarine/commands': minor
---

`/scoreboard objectives add` checks its criterion as Java does and hands the host the criterion's full name, so `custom:play_time` arrives as `minecraft.custom:minecraft.play_time`, and an unknown criterion is a syntax error. The new `@jsprismarine/commands/criteria` module looks criteria up with `criterionByName`. `ContentRegistryIds.statistics` lists the entries each statistic type counts, and the criterion is checked against it. `setdisplay` takes Java's `below_name` as well as `belowname`, and hands the host `belowname` for both. `scoreboard players set`, `add`, `remove` and `operation` refuse a read-only objective such as `health`, while `execute store` still writes it. `scoreboard objectives modify <objective> displayname` renames an objective. `ScoreboardCommandHost` gains two required members, `criterionOf` and `setDisplayName`, so a host that implements it has to add them.
