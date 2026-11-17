---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
---

A behavior pack script can now read which server it runs on from `@jsprismarine/server`: its `jsprismarine` export holds the server's `name`, `version`, `minecraftVersion` and `protocolVersion`. A pack leaves the module out of its manifest and loads it with `import()` inside `try`, so on Bedrock Dedicated Server the import rejects and the pack falls back. The new `@jsprismarine/script-types` package holds the TypeScript declarations for the module.

An `async` callback passed straight to `system.run` or an event's `subscribe` now runs past its first `await`.
