---
'@jsprismarine/prismarine': patch
---

A player's chat now reaches other clients the way a dedicated server sends it: a `Chat` text whose author is the sender's name and whose XUID is the sender's, with the message as typed. The server used to put `<name>` into the message and leave the author blank, which the client draws as its own empty `<>`. The console prints the same `<name> message` line. `TextHandler` drops a text whose type is not `Chat`, the only type a client sends, and `Chat` defaults to `RAW`, so a line the server formatted itself is shown as written.
