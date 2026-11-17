---
'@jsprismarine/protocol': patch
---

Mark every `AvailableCommandsPacket` overload that starts with one of its command's chained keywords as `isChaining`, not only the ones that end in a chained subcommand. `/execute run <command>` is now sent as chaining, the way a Bedrock Dedicated Server sends it.
