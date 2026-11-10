---
"@jsprismarine/prismarine": patch
---

`World.replayStateDigest` no longer leaves a data-driven entity's component record on its body. Taking a digest wrote that record into `persistentNbt`, so a body with no compound gained one and was no longer matched as a legacy duplicate when its chunk reloaded. The digest still hashes the record, and each body's `persistentNbt` is put back as it was once the hash is taken.
