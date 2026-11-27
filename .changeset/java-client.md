---
"@jsprismarine/client": patch
"@jsprismarine/errors": patch
---

`@jsprismarine/client` gains `JavaClient`, a Java Edition client that pings a server, logs in, with encryption through a `joinSession` hook when the server is in online mode and compression when it turns it on, goes through the configuration and stays in play: it answers keep-alives, confirms teleports, acknowledges chunk batches, sends `Player Loaded`, chats and moves. Every packet it reads is reported with its fields through its `packet` event.
