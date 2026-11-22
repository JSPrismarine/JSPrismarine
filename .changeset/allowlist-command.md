---
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': patch
'@jsprismarine/bedrock-data': patch
---

Adds `/allowlist`, with Java's `/whitelist` as its alias: `add`, `remove`, `list`, `on`, `off` and `reload`, answering with the lines Bedrock Dedicated Server's console prints for each. `/allowlist on` is refused while `online-mode` is off, as on BDS. A player whose allow list entry has `ignoresPlayerLimit` set now joins a full server.

`ServerCommandHost` has a new `allowList` member, so a host that implements it has to add one. The `minor` bump is that change.
