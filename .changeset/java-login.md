---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

A Java Edition client can log in. With `online-mode` on, the server verifies the player with Mojang's session server, as a vanilla server does, and encrypts the connection; off, the player gets the UUID their name gives. Every login is compressed, and the server then ends the join in the configuration phase until Java Edition players can play. `@jsprismarine/protocol` gains the login packets, `Disconnect (configuration)`, and Java's UUID and plain text component types.
