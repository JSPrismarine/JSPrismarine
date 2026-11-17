---
'@jsprismarine/commands': patch
---

Mark every flattened overload that starts with one of its command's chained keywords as chaining, so `buildAvailableCommands` sends `/execute run <command>` as chaining, the way a Bedrock Dedicated Server does.
