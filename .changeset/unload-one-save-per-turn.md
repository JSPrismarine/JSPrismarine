---
'@jsprismarine/prismarine': patch
---

Save one chunk of an unload batch per turn of the event loop. A batch of eight chunks was encoded in a single turn, which held the server tick for up to a second while a player moved.
