---
'@jsprismarine/leveldb': patch
---

The database no longer writes through a symbolic link planted in its directory. A new manifest, table or temporary file removes whatever entry already holds its name and is created exclusively, and a log is opened for appending with `O_NOFOLLOW` and must be a regular file. A link at one of those names used to be followed, which truncated or appended to a file outside the database directory.
