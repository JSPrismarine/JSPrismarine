---
'@jsprismarine/prismarine': patch
---

Log why a client disconnected, including one that gave up during the join.

A `DisconnectPacket` from the client used to hit "Invalid handler with id 5" and the reason it carried was lost. The server now logs the reason and message at info level and hangs up on RakNet; the RakNet close that follows releases the player as before. A RakNet close for a connection that has not logged in, or whose player has not been added to a world yet, is also logged at info instead of debug, so a client that drops out between login and spawn leaves a line in the console (#2582).
