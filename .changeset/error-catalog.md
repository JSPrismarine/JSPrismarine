---
'@jsprismarine/errors': minor
'@jsprismarine/auth': minor
'@jsprismarine/blocks': minor
'@jsprismarine/chunkgen': minor
'@jsprismarine/client': minor
'@jsprismarine/commands': minor
'@jsprismarine/content': minor
'@jsprismarine/features': minor
'@jsprismarine/items': minor
'@jsprismarine/kernel': minor
'@jsprismarine/leveldb': minor
'@jsprismarine/minecraft': minor
'@jsprismarine/molang': minor
'@jsprismarine/native-network': minor
'@jsprismarine/nbt': minor
'@jsprismarine/nethernet': minor
'@jsprismarine/packs': minor
'@jsprismarine/prismarine': minor
'@jsprismarine/structures': minor
---

Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.

The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.
