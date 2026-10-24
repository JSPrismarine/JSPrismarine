---
'@jsprismarine/prismarine': patch
---

Send an empty `FeatureRegistryPacket` (id 191) to every joining client, after `BiomeDefinitionList` in the registry group of the join burst, as a Bedrock Dedicated Server does for a world with no custom features. The packet class is new and registered.
