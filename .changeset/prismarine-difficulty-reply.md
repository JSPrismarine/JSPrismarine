---
'@jsprismarine/prismarine': patch
---

`SetDifficultyHandler` sends the configured difficulty back when a client asks for a
different one, so the client's settings menu no longer shows a difficulty the server does
not have. A value that is no difficulty is answered the same way and nothing is thrown.
