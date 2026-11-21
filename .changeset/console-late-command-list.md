---
'@jsprismarine/console': patch
---

Keep the server's command list when the request sent at startup answers after the one sent once the server is running. The console used to drop that answer, so a server too busy to answer the second request left the palette without its commands.
