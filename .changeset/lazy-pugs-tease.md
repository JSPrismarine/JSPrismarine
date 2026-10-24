---
'@jsprismarine/logger': patch
'@jsprismarine/color-parser': minor
'@jsprismarine/prismarine': minor
'@jsprismarine/brigadier': patch
'@jsprismarine/math': patch
'@jsprismarine/server': patch
---

Drop dependencies and constructs that block ahead-of-time compilation with scriptc.

- `@jsprismarine/logger` no longer wraps winston. The `Logger` API is unchanged; transports now implement the package's own `LogTransport` interface, and a `FileTransport` replaces winston's file transport.
- `@jsprismarine/color-parser` declares its ANSI sequences directly instead of reading them out of chalk-cjs. The emitted escapes are identical; the chalk-specific exports are gone.
- `@jsprismarine/prismarine` decodes login JWTs with plain base64url instead of fast-jwt, parses config files with json5 and js-yaml instead of confbox, and drops the debug-only `Symbol.toStringTag` accessors on `Entity`, `Block` and `BlockState`.
- `@jsprismarine/brigadier` merges the exception classes into one module to remove an import cycle; the old module paths re-export from it.
- `@jsprismarine/math` widens `Vector3.equals` to accept `Vector2` (returning `false`), matching the base signature.
- `@jsprismarine/server` reads env files with `process.loadEnvFile` instead of dotenv.
