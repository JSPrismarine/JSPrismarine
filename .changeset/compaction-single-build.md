---
'@jsprismarine/leveldb': patch
---

Compaction builds each output table once. It used to finish a table past the file size cap and then search for a prefix that fit, building and compressing the same entries four to six times over. It now cuts a table before the entry that could take it past the cap, using an upper bound on the finished size, so every output still fits the cap.
