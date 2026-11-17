---
'@jsprismarine/prismarine': patch
---

A server pointed at a Bedrock Dedicated Server `behavior_packs` folder through `JSP_VANILLA_BEHAVIOR_PACK` now lays the `bedrock-samples` pack under it, as it already did for the cached copy. Without it, butcher, cleric and mason villagers had no trades, since the server ships their trade tables as binary files. `JSP_BEDROCK_SAMPLES_PATH` names the unpacked samples archive to use.
