---
'@jsprismarine/protocol': patch
---

Add `CommandDataFlags` to `bedrock/wire/structures/CommandData`, with `NOT_CHEAT` (`0x80`): the bit a Bedrock Dedicated Server sets on a command a client may send in a world with cheats off.
