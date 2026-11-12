---
"@jsprismarine/prismarine": patch
---

A position a client reported before a server teleport no longer moves the player back. Its inputs are ignored until one carries `HandledTeleport` at the target, or the hold times out. A move the client sent before the teleport is applied in the next input step, after the teleport, and moved the player back. The chunks queued for the target then went out under a publisher update centered on the old spot, so the client dropped them while the server counted them as sent.
