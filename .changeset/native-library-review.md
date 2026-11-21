---
'@jsprismarine/native-library': patch
'@jsprismarine/errors': patch
---

`operatingSystemOf` now returns the operating system any platform key names, such as `freebsd` for `freebsd-x64`, where it used to answer `linux` for everything but Windows, macOS and Android. `InvalidNativeManifest` and `InvalidNativeManifestEntry` now extend `NativeLibraryError`, so the one `instanceof` check catches a malformed manifest too.
