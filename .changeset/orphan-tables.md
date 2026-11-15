---
'@jsprismarine/leveldb': patch
---

Opening a database for writing deletes the table files its manifest does not name, as upstream LevelDB does. A crash between writing a table and recording it, or during a compaction, left such a file behind for good. A read-only open still deletes nothing.
