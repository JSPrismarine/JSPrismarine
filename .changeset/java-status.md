---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

With `java-enabled` on, the server listens for Java Edition clients on `java-port`, 25565 by default. A Java client's server list shows the server's MOTD, the Java release it speaks and the player count of both editions; a join is refused with a message saying Java Edition players cannot join yet. `@jsprismarine/protocol` gains `src/java/` with Java's wire types, its handshake, status and login disconnect packets, and the Java releases the server speaks.
