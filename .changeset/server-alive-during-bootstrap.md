---
'@jsprismarine/server': patch
---

The server process no longer exits with code 0 while it prepares the start region of a saved world. The timer that keeps the process alive is now taken before the bootstrap instead of after it, so loading saved chunks, which can leave nothing else referenced, no longer ends the process. A container restart policy then restarted the server into the same exit.
