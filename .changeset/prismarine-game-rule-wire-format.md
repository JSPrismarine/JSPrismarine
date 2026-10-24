---
'@jsprismarine/prismarine': patch
---

Game rules now reach the client under the names it knows. `StartGamePacket` and
`GameRulesChangedPacket` wrote every rule name in lowercase (`showcoordinates`,
`dodaylightcycle`), and the client, which matches a rule by exact string, had no rule by
those names. The names are now spelled as a Bedrock Dedicated Server spells them
(`showCoordinates`, `doDayLightCycle`). Lookups through `GameRuleManager` ignore case, so
level files written by an older server still load, and the `GameRules` constants carry the
new spelling. An integer rule is written as a signed int32, so a negative value no longer
throws while the join packets are being encoded.
