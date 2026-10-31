---
"@jsprismarine/commands": patch
"@jsprismarine/prismarine": patch
---

Accept a namespaced dimension id in `/execute in` and `execute if dimension`. `minecraft:the_nether` and a custom `mypack:skylands` were both prefixed with a second `minecraft:`, so only the bare vanilla names resolved. The dimension argument now suggests the host's loaded dimensions, and the Java `minecraft:dimension` parser keeps the Bedrock `Dimension` enum in the command packet.
