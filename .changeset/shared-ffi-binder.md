---
'@jsprismarine/native-library': minor
'@jsprismarine/native-network': minor
'@jsprismarine/script-host': minor
'@jsprismarine/errors': minor
---

`@jsprismarine/native-network` now binds its library through `@jsprismarine/native-library/ffi`'s `bindNative`, and `@jsprismarine/script-host` loads `node:ffi` through its new `nodeFfi()`. Each package had kept its own copy of that code.

Breaking: `NativeNetworkErrors.FfiUnavailable` and `ScriptHostErrors.FfiUnavailable` are removed. A runtime without `node:ffi` now throws `NativeLibraryErrors.FfiUnavailable`, which is still a `NativeLibraryError`, so an `instanceof NativeLibraryError` check still catches it.
