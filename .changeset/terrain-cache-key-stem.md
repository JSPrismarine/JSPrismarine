---
'@jsprismarine/prismarine': patch
---

Hash a world's noise settings once per generator rather than once per chunk when building terrain cache keys. Each key used to rehash about 1.3 MB of canonical settings on the server thread. Existing terrain cache records miss once and are rewritten under the new keys.
