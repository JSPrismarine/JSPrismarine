---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

Keep a NetherNet connection whose peer reports `disconnected` for up to 30 seconds, and end it only if the peer stays that way or reaches `failed` or `closed`. A connection used to close 2 seconds after the first `disconnected`, so a player on a phone was dropped when they opened their notifications or put the game in the background, and the game showed "Terracotta" when they came back. `Connection.peerStateChanged` follows the peer's state for the server and the client, and `PEER_RECOVERY_MS` is how long a peer may take to recover.
