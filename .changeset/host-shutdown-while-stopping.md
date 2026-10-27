---
'@jsprismarine/prismarine': patch
---

Stop forcing the exit when the host asks a server that is already stopping to stop.

In a plain terminal one Ctrl+C reaches the server child directly, and again as the host's
`shutdown` message. `RemoteConsole` passed that message on to `Server.shutdown`, which takes a
second request as an interrupt and forces the exit, so the world save the first one started never
finished. The console now ignores a shutdown request once the server has begun stopping.
