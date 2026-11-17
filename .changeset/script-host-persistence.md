---
'@jsprismarine/script-host': patch
---

Scripts now have dynamic properties and a scoreboard. `World`, `Entity` and `ItemStack` implement `getDynamicProperty`, `setDynamicProperty`, `setDynamicProperties`, `getDynamicPropertyIds`, `getDynamicPropertyTotalByteCount` and `clearDynamicProperties`, keyed by the pack's header UUID on the world and on entities and by its script module UUID on item stacks, with Bedrock Dedicated Server's checks, byte counts and error messages. Only an item that does not stack holds properties. `world.scoreboard`, `ScoreboardObjective`, `ScoreboardIdentity`, `ScoreboardScoreInfo` and `Entity.scoreboardIdentity` read and write the world's scoreboard. `ScriptWorld` gains `dynamicProperties`, `setDynamicProperties`, `clearDynamicProperties` and `scoreboard`, and `ScriptItem` gains `dynamicProperties`.

`ScriptApiImplementations.implement` takes a `converts` option naming the arguments an implementation converts itself, which the binding then passes on unchecked. An argument out of bounds now writes its value as BDS does, with two decimals past the 32-bit range.
