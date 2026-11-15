---
'@jsprismarine/leveldb': minor
---

Opening a database whose log is damaged now skips the damage the way Bedrock does instead of refusing the whole world. A bad checksum or an impossible record length drops the rest of its 32 KiB log block, a fragment out of sequence is dropped on its own, and a damaged batch applies the operations before the damage. Each skipped stretch goes to the new `onCorruption` option, which defaults to `console.warn`. A damaged manifest is still refused, as upstream LevelDB refuses it. `MemTable.maxSequence`, which nothing called once replay counts sequences from each batch's header, is removed from the `@jsprismarine/leveldb/db/MemTable` module.
