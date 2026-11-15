---
'@jsprismarine/leveldb': patch
---

Each flush and compaction appends one edit to the open manifest and syncs it once, as upstream LevelDB and Bedrock do. It used to write a whole new manifest and replace `CURRENT` each time, which took three syncs and rewrote every file's entry. A fresh manifest is still written when the database opens and once the open one passes 2 MiB. If an append fails, a fresh manifest of the version before it replaces the one it went to, and if that fails too the database keeps the edit's tables and refuses further writes and flushes.
