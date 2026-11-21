---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/native-library': patch
'@jsprismarine/errors': patch
---

Add `@jsprismarine/native-worldgen`, which runs worldgen's octave noise stacks in C with the same bits as the TypeScript `NoiseStack.get3`. It loads through `node:ffi` under Node.js and `bun:ffi` under Bun, one position or one buffer of positions per call. Builds are published per platform like the other native packages.

`@jsprismarine/native-library/ffi` opens a native library through either runtime's FFI from one table of C signatures. `@jsprismarine/errors` gains the `native-worldgen` catalog and `NativeLibraryErrors.FfiUnavailable`.
