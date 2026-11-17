---
'@jsprismarine/prismarine': patch
---

A level now keeps its scripts' dynamic properties and its scoreboard, and saves both in Bedrock Dedicated Server's format: the world's properties under the LevelDB record `DynamicProperties`, an entity's in its actor record's `DynamicProperties` tag, and the scoreboard under the record `scoreboard`. A world moved from BDS keeps its properties and scores, and BDS reads the ones a JSPrismarine world saved. `/scoreboard` and a selector's `scores=` use the default level's scoreboard, which the scripts' `world.scoreboard` shares, so scores now survive a restart. `Level.getDynamicProperties` and `Level.getScoreboard` return the two stores, and a provider's save pass takes them through `putLevelRecords`.
