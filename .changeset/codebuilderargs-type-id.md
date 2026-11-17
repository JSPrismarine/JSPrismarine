---
'@jsprismarine/protocol': patch
'@jsprismarine/commands': patch
---

Give `CODEBUILDERARGS`, the command `/execute run` takes, the type id 90 a Bedrock Dedicated Server writes, not 92. `AvailableCommandsPacket` now decodes a real server's packet, which it rejected as carrying an unknown parse symbol.
