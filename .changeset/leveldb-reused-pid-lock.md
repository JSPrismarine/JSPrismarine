---
'@jsprismarine/leveldb': patch
---

A `LOCK` file that names the current process, but that the process does not hold, is now treated as stale and taken over. Inside a container the server always runs as pid 1, so a server killed before it released the lock left `1 <hostname>` behind, and every later start on the same host refused with `DatabaseLockedError`.
