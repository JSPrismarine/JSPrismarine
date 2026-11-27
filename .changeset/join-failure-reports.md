---
'@jsprismarine/prismarine': patch
---

Log a warning with a link to a pre-filled GitHub issue when a Bedrock or Java client fails to join through the server's fault. The issue lists the server's and the client's versions, the join step, the error and the last packets the server sent, and leaves out the player's name and address. A Bedrock join reports a handler or decode failure, a `PacketViolationWarning`, a `Disconnect` reason that blames the server's packets, or a timeout before the player spawns. A Java join reports a handler failure, or a client that hangs up between its configuration and loading the world.
