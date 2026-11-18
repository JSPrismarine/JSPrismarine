---
'@jsprismarine/prismarine': patch
---

Send a vanilla item that a session's protocol version lacks as `minecraft:info_update` instead of under another version's runtime id. A 1.26.51 player watching a 1.26.60 player hold a frostbite spawn egg saw wool, and a 1.26.60 item built by name showed as an empty slot. A custom item keeps the number its registry gave it.
