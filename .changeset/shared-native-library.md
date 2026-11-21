---
'@jsprismarine/native-library': patch
'@jsprismarine/errors': minor
'@jsprismarine/native-network': minor
'@jsprismarine/script-host': minor
---

Add `@jsprismarine/native-library`, which finds, checks and installs a package's prebuilt native library. `@jsprismarine/native-network` and `@jsprismarine/script-host` now load their libraries through it, so both behave the same way.

Breaking changes:

- The errors for a missing, unverified or undownloadable library, and for a malformed native manifest (`InvalidNativeManifest`, `InvalidNativeManifestEntry`), moved from `NativeNetworkErrors` and `ScriptHostErrors` to `NativeLibraryErrors` in `@jsprismarine/errors/native-library`, and their codes now start with `NATIVE_LIBRARY_`.
- `NativeLibraryError` is now exported only from `@jsprismarine/errors/native-library`, so one `instanceof` check catches loading errors from either package.
- `@jsprismarine/script-host/library` no longer exports `localBuildDigest`, `recordLocalBuild` or the `LocateOptions` type. `LocateOptions` comes from `@jsprismarine/native-library`, and `NativeLibrary` covers what the other two did.
- `@jsprismarine/script-host/manifest` is removed. Import the manifest parser from `@jsprismarine/native-library/manifest`.
- In a checkout, `@jsprismarine/native-network` on a platform without a published build now says how to build the library instead of saying no build is published.

A packager's `libraryForPlatform` now replaces an installed file that fails its digest check with the published build instead of throwing.
