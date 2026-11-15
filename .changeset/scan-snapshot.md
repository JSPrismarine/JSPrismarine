---
'@jsprismarine/leveldb': patch
---

`Database.entries` and `Database.keys` read the database as it was at their first entry. A compaction that finished during a scan closed the tables the scan was still reading, and the scan then failed with `EBADF`; replaced tables now stay open and on disk until the last running scan ends. A write made during a scan could shift the memtable under it, so the scan would show some later writes and skip or repeat entries. A scan also opens one table per sorted level at a time instead of every table at once, and a range scan seeks to its start instead of reading every key before it.
