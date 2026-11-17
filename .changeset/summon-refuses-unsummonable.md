---
'@jsprismarine/prismarine': patch
---

`/summon` refuses the entity types whose definition says `"is_summonable": false`, as Bedrock Dedicated Server does. The summon argument no longer offers projectiles such as `fishing_hook`, `minecraft:player` or `jsprismarine:inert_actor`, so typing one fails at parse. `/summon villager` still spawns `villager_v2` through the legacy name.
