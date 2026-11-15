---
'@jsprismarine/leveldb': patch
---

A point read no longer misses a key longer than 24 bytes that shares a prefix with the key before it in its block. When a block's first lookup reached such a key, the reader grew its key buffer without keeping the shared prefix, compared a damaged key and reported the key missing. Player records (`player_server_<uuid>`) and ticking areas (`tickingarea_<uuid>`) have this shape, so a returning player could load as new.
