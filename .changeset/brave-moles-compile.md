---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/brigadier': patch
'@jsprismarine/color-parser': patch
'@jsprismarine/errors': minor
'@jsprismarine/math': patch
'@jsprismarine/minecraft': patch
'@jsprismarine/nbt': patch
'@jsprismarine/prismarine': minor
'@jsprismarine/raknet': minor
---

Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.

- `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
- `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
- `@jsprismarine/errors` declares its `Error` base without a type parameter.
- `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
- `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
- `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
- `@jsprismarine/raknet` declares `sendPacket` without a type parameter.
