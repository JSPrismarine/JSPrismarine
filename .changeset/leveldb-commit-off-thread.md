---
'@jsprismarine/leveldb': patch
---

Add `Database.commit`, which applies a batch at once and appends its log record on libuv's thread pool, and a per-call `sync` option for `write` and `commit`. Commits append in the order they were made, and `write` refuses to overtake one still appending. A commit whose append fails fails the commits queued behind it too, which were framed for an offset past the failed record, and the database then refuses every later write. A log record is now framed as headers over views of the encoded batch, so appending a batch no longer copies it a second time. `replaceFileAtomically`, which writes a file the way the database rewrites `CURRENT`, is exported for the files a save keeps beside its database.
