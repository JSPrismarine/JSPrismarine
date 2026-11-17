---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/prismarine': patch
---

Publish `entity_identifiers` from `@jsprismarine/bedrock-data/v2225` and `/v2259`, built from each version's own `AvailableActorIdentifiersPacket` capture. A protocol 2225 or 2259 session now receives its version's actor list, so a 2225 client can be told about `minecraft:ice_ball`.
