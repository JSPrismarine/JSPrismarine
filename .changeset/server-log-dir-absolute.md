---
'@jsprismarine/server': patch
---

Write log files to `JSP_DIR` when it is an absolute path. Before this change, `JSP_DIR=/data` put the logs under `<working directory>/data/logs`, so a server in a read-only working directory, such as the Docker image's, crashed on startup.
