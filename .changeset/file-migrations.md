---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

The server upgrades `config.json` and `permissions.json` in place when a release changes their shape or defaults. Each file names its layout in `schemaVersion`, and loading runs every step from the file's version to the current one in order, keeps the original beside it as `<file>.v<version>.bak` and logs both versions. A file at the current version is not rewritten, and a file newer than the server is refused. `permissions.json` moves to version 3, which adds `jsprismarine.command.link` and `jsprismarine.command.unlink` to the `default` group of an existing file; its backup is now `permissions.json.v1.bak` rather than `permissions.json.bak`. `config.json` gains `schemaVersion` 1, and the rename of `port` to `server-port` becomes its first step. `Config.enable` takes an optional logger for the migration line. The errors catalog replaces `PermissionsNotObject` and `PermissionsSchemaUnsupported` with `VersionedFileNotObject`, `FileVersionInvalid`, `FileVersionTooNew` and `FileMigrationsMisdeclared`.
