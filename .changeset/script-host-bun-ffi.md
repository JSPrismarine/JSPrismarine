---
'@jsprismarine/script-host': patch
'@jsprismarine/server': patch
---

The script host binds its library through `bun:ffi` under Bun as well as `node:ffi` under Node.js, and the prebuilt executables embed that library, so they run behavior pack scripts.
