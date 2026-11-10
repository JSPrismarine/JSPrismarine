---
"@jsprismarine/prismarine": patch
---

Build the shipped block-state schemas from `@jsprismarine/blocks`' vanilla palette instead of reading the generated catalog a second time, so one package owns which states a block has and what each accepts. `BlockStateValue` is now `@jsprismarine/blocks`' type, re-exported unchanged, and `schemaFromModel` turns a `BlockStateModel` into the NBT-typed schema the runtime id hash uses. Runtime ids do not change.
