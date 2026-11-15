---
'@jsprismarine/leveldb': patch
---

New tables cut their data blocks at 160 KiB, the size Bedrock writes, instead of 4 KiB. On a world Bedrock Dedicated Server generated, tables come out 19% smaller and loading a chunk reads 1.1 blocks on average instead of 4.4, while a chunk loaded with a cold cache decompresses more bytes. Existing tables stay readable at whatever block size they were written with and take the new one when a compaction rewrites them. Pass `blockSize` to keep the old size.
