---
'@jsprismarine/leveldb': patch
---

Delete the write-ahead logs an open leaves behind. Recovery replays the old logs, flushes
whatever they held into a table and starts a fresh log, but never removed the ones it had
finished with - so every open leaked a file. A world a developer restarts all day had 132 empty
logs in it, which recovery then reads past on each open. Stale manifests were already cleaned up
this way; logs now are too.
