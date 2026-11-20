---
'@jsprismarine/errors': patch
'@jsprismarine/native-network': patch
---

Refuse to load the native networking library on a Node.js without `node:ffi`, such as one started with `--no-experimental-ffi`, with a `NativeLibraryError` that names the requirement. It used to fail at `dlopen` with `TypeError: Cannot read properties of undefined`. `NativeNetworkErrors.FfiUnavailable` is the new catalog entry.
