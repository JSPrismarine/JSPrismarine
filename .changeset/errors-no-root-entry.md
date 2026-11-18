---
'@jsprismarine/errors': patch
---

Stop advertising a root `@jsprismarine/errors` import, which named a module the package no longer has. Import a catalog from its own entry, such as `@jsprismarine/errors/leveldb`.
