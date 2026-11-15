---
'@jsprismarine/leveldb': patch
---

A table saved under the `.sst` name LevelDB used before 1.14 now opens when no `.ldb` file has its number, as it does in upstream LevelDB. The name was recognized but never opened, so a database holding one failed with `ENOENT` on the first read that reached it.
