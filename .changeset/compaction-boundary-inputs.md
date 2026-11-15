---
'@jsprismarine/leveldb': patch
---

Compacting a level now takes every neighboring file that holds more of the picked file's last key. LevelDB before 1.23 could split one key's versions across two files of a level, newest first, so a world saved by the game can contain such a split. Compacting only the first file moved the newest version below an older one, and reads of that key returned the older value from then on.
