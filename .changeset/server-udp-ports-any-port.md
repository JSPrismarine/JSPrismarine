---
'@jsprismarine/prismarine': patch
---

A config whose `server-port` is 0, which asks the system for a free port, no longer writes 0 as `server-udp-ports`, which refused the server's start. The key is left empty, so NetherNet follows the port the server is given.
