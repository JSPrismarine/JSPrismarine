---
'@jsprismarine/prismarine': patch
---

A dimension change now holds its first chunks back until the client reports that the change's loading screen opened, or for two seconds at most. A client that decoded those chunks before switching dimension filed them under the dimension it was leaving and then waited on its loading screen forever.
