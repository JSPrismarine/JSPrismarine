---
'@jsprismarine/prismarine': patch
---

Build a block schema's property type map once. `BlockStateSchema.getPropertyTypes` rebuilt the
record from two intermediate arrays on every call, and reading or writing a sub chunk calls it
once per palette entry. A schema is immutable, so it is memoized the way its default state
already was.
