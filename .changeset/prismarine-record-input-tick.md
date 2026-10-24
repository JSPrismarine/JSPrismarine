---
'@jsprismarine/prismarine': patch
---

`PlayerAuthInputHandler` records each input's `Tick` on the session before doing anything else, so the packets the server sends back about that player carry it as their `PlayerInputTick`.
