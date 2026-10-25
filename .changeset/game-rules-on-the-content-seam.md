---
'@jsprismarine/prismarine': minor
---

Put the game rules on the content world seam. `ContentLevelFacts` carried the clock, the bounds
and the weather and no rules at all, so nothing reached over that seam could read one. A creeper
on the data-driven entity path griefed with `mobGriefing` off, because `EntityRuntime.explode`
had no rule to pass to `detonate`'s `breaksBlocks`.

`ContentLevelFacts.gameRule` answers one rule by any spelling the `@jsprismarine/commands`
registry knows: the 1.21.11 id `minecraft:mob_griefing`, the pre-1.21.11 `mobGriefing`, or
Bedrock's `mobgriefing`. The live world resolves the asked-for name against that registry and
looks the result up in its own `GameRuleManager`, so the content path and the Bedrock client do
not have to agree on a spelling. A rule the world never registered reads as absent rather than
as off.

`src/content/world/gameRules.ts` names the rules the content path reads and resolves each
through the registry, so a rule renamed again fails at startup instead of reading nothing. The
data-driven entity runtime now reads four of them: `mobGriefing` decides whether a blast carves
a hole and whether a mob may break a block at all, `doTileDrops` whether either leaves items
behind, `doMobLoot` whether a dead mob rolls its table, and `doMobSpawning` whether the natural
spawn cycle runs. Damage and knockback are unaffected by `mobGriefing`, and the despawn pass
still runs with `doMobSpawning` off, both as in Java.

`GameRuleManager.findGameRule` is the same lookup as `getGameRule` without the log line a miss
writes, for a caller trying several spellings of one rule.
