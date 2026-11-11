---
'@jsprismarine/leveldb': minor
---

`CompressionType` is now a constant object and a union type of its values instead of an enum. `CompressionType.Snappy` and the other members still work as values and `CompressionType` as a type, but a member can no longer be used as a type of its own. From source in a checkout, the table builder worker now runs on Node's built-in type stripping instead of `tsx`, so `tsx` is no longer a development dependency.
