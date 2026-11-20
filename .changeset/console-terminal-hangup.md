---
'@jsprismarine/console': patch
---

Closing the terminal the console runs in no longer leaves the server host spinning at full CPU. A failed write to the hung-up terminal surfaced as an uncaught exception whose terminal reset failed the same way, over and over, so the host never reached its own shutdown. The console now stops writing once the terminal is gone, and the host exits.
