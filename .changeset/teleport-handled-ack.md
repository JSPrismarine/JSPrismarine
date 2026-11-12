---
'@jsprismarine/prismarine': patch
---

After the server teleports a player, it ignores the positions in that player's inputs until one carries `HandledTeleport` at the teleport's target, or five seconds pass. A client goes on sending its old position until it applies the teleport, and taking that position moved the player back on the server alone, which then sent chunks for the wrong place. A client that stops sending inputs while it waits for chunks never recovered.
