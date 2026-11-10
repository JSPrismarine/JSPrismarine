---
"@jsprismarine/prismarine": patch
---

Ignore a client's reported position after a server teleport until the client acknowledges it, with the `HandledTeleport` input flag or a position within a block of the target. An input sent before the teleport is applied in the next input step, after the teleport, and moved the player back. The chunks queued for the target then went out under a publisher update centered on the old spot, so the client dropped them while the server counted them as sent.
