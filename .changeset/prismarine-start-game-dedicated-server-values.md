---
'@jsprismarine/prismarine': patch
---

`StartGamePacket` now fills its fixed level and join fields with the values a Bedrock Dedicated Server 1.26.51 sends: the spawn biome name is `minecraft:plains`, Nether Type is false, Limited World Width and Depth are 16, Server Version is the newest version the server speaks, and Server Configuration Join Info is present and empty rather than absent.
