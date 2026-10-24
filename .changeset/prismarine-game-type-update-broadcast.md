---
'@jsprismarine/prismarine': patch
---

A player's game type change is followed by `UpdatePlayerGameTypePacket` to every client in
the world, which the protocol docs ask for so each client's cached game type and permission
flags for that player stay current. The packet carries the receiving client's last input tick
when the player is its own, and zero for anyone else.
