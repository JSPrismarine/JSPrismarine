---
'@jsprismarine/prismarine': patch
---

`/data` is registered and works on command storage: `get` with Java's result and scale, `merge`, `modify` with `set`, `append`, `prepend`, `insert` and `merge` from a value or from another storage, and `remove`. `execute if data storage`, `execute store … storage` and `/function … with storage` read and write the default level's storage. A block or an entity target is refused with "This server has no NBT paths for blocks and entities yet" ([#3575](https://github.com/JSPrismarine/JSPrismarine/issues/3575)), and `/item modify` and `/item … from` refuse with a sentence that reads as one.
