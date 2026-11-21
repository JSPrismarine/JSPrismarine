# @jsprismarine/native-library

## 0.24.0

### Minor Changes

- [#3558](https://github.com/JSPrismarine/JSPrismarine/pull/3558) [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/native-network` now binds its library through `@jsprismarine/native-library/ffi`'s `bindNative`, and `@jsprismarine/script-host` loads `node:ffi` through its new `nodeFfi()`. Each package had kept its own copy of that code.
  
  Breaking: `NativeNetworkErrors.FfiUnavailable` and `ScriptHostErrors.FfiUnavailable` are removed. A runtime without `node:ffi` now throws `NativeLibraryErrors.FfiUnavailable`, which is still a `NativeLibraryError`, so an `instanceof NativeLibraryError` check still catches it.

### Patch Changes

- [`e1f36b8`](https://github.com/JSPrismarine/JSPrismarine/commit/e1f36b83616149c2e27f4276d423cdb6f43e3ed6) Thanks [@filiphsps](https://github.com/filiphsps)! - The native source hash now covers what `@jsprismarine/native-library`'s naming helpers return instead of the text of their module, and leaves out the modules that only compute the hash. Editing those modules without changing a build no longer publishes new builds, and in a checkout no longer makes the library build locally. `nativeSourceHash` takes the helpers' output as a third argument, from the new `namingAnswers` in `@jsprismarine/native-library/platform`.

- [#3535](https://github.com/JSPrismarine/JSPrismarine/pull/3535) [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5) Thanks [@filiphsps](https://github.com/filiphsps)! - `operatingSystemOf` now returns the operating system any platform key names, such as `freebsd` for `freebsd-x64`, where it used to answer `linux` for everything but Windows, macOS and Android. `InvalidNativeManifest` and `InvalidNativeManifestEntry` now extend `NativeLibraryError`, so the one `instanceof` check catches a malformed manifest too.

- [#3532](https://github.com/JSPrismarine/JSPrismarine/pull/3532) [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-worldgen`, which runs worldgen's octave noise stacks in C with the same bits as the TypeScript `NoiseStack.get3`. It loads through `node:ffi` under Node.js and `bun:ffi` under Bun, one position or one buffer of positions per call. Builds are published per platform like the other native packages.
  
  `@jsprismarine/native-library/ffi` opens a native library through either runtime's FFI from one table of C signatures. `@jsprismarine/errors` gains the `native-worldgen` catalog and `NativeLibraryErrors.FfiUnavailable`.

- [#3513](https://github.com/JSPrismarine/JSPrismarine/pull/3513) [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-library`, which finds, checks and installs a package's prebuilt native library. `@jsprismarine/native-network` and `@jsprismarine/script-host` now load their libraries through it, so both behave the same way.
  
  Breaking changes:
  
  - The errors for a missing, unverified or undownloadable library, and for a malformed native manifest (`InvalidNativeManifest`, `InvalidNativeManifestEntry`), moved from `NativeNetworkErrors` and `ScriptHostErrors` to `NativeLibraryErrors` in `@jsprismarine/errors/native-library`, and their codes now start with `NATIVE_LIBRARY_`.
  - `NativeLibraryError` is now exported only from `@jsprismarine/errors/native-library`, so one `instanceof` check catches loading errors from either package.
  - `@jsprismarine/script-host/library` no longer exports `localBuildDigest`, `recordLocalBuild` or the `LocateOptions` type. `LocateOptions` comes from `@jsprismarine/native-library`, and `NativeLibrary` covers what the other two did.
  - `@jsprismarine/script-host/manifest` is removed. Import the manifest parser from `@jsprismarine/native-library/manifest`.
  - In a checkout, `@jsprismarine/native-network` on a platform without a published build now says how to build the library instead of saying no build is published.
  
  A packager's `libraryForPlatform` now replaces an installed file that fails its digest check with the published build instead of throwing. In a checkout whose native sources differ from the published builds, nothing is downloaded, so it still throws there.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0

## 0.24.0-unstable-20261121134751

### Minor Changes

- [#3558](https://github.com/JSPrismarine/JSPrismarine/pull/3558) [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/native-network` now binds its library through `@jsprismarine/native-library/ffi`'s `bindNative`, and `@jsprismarine/script-host` loads `node:ffi` through its new `nodeFfi()`. Each package had kept its own copy of that code.
  
  Breaking: `NativeNetworkErrors.FfiUnavailable` and `ScriptHostErrors.FfiUnavailable` are removed. A runtime without `node:ffi` now throws `NativeLibraryErrors.FfiUnavailable`, which is still a `NativeLibraryError`, so an `instanceof NativeLibraryError` check still catches it.

### Patch Changes

- [`e1f36b8`](https://github.com/JSPrismarine/JSPrismarine/commit/e1f36b83616149c2e27f4276d423cdb6f43e3ed6) Thanks [@filiphsps](https://github.com/filiphsps)! - The native source hash now covers what `@jsprismarine/native-library`'s naming helpers return instead of the text of their module, and leaves out the modules that only compute the hash. Editing those modules without changing a build no longer publishes new builds, and in a checkout no longer makes the library build locally. `nativeSourceHash` takes the helpers' output as a third argument, from the new `namingAnswers` in `@jsprismarine/native-library/platform`.

- [#3535](https://github.com/JSPrismarine/JSPrismarine/pull/3535) [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5) Thanks [@filiphsps](https://github.com/filiphsps)! - `operatingSystemOf` now returns the operating system any platform key names, such as `freebsd` for `freebsd-x64`, where it used to answer `linux` for everything but Windows, macOS and Android. `InvalidNativeManifest` and `InvalidNativeManifestEntry` now extend `NativeLibraryError`, so the one `instanceof` check catches a malformed manifest too.

- [#3532](https://github.com/JSPrismarine/JSPrismarine/pull/3532) [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-worldgen`, which runs worldgen's octave noise stacks in C with the same bits as the TypeScript `NoiseStack.get3`. It loads through `node:ffi` under Node.js and `bun:ffi` under Bun, one position or one buffer of positions per call. Builds are published per platform like the other native packages.
  
  `@jsprismarine/native-library/ffi` opens a native library through either runtime's FFI from one table of C signatures. `@jsprismarine/errors` gains the `native-worldgen` catalog and `NativeLibraryErrors.FfiUnavailable`.

- [#3513](https://github.com/JSPrismarine/JSPrismarine/pull/3513) [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-library`, which finds, checks and installs a package's prebuilt native library. `@jsprismarine/native-network` and `@jsprismarine/script-host` now load their libraries through it, so both behave the same way.
  
  Breaking changes:
  
  - The errors for a missing, unverified or undownloadable library, and for a malformed native manifest (`InvalidNativeManifest`, `InvalidNativeManifestEntry`), moved from `NativeNetworkErrors` and `ScriptHostErrors` to `NativeLibraryErrors` in `@jsprismarine/errors/native-library`, and their codes now start with `NATIVE_LIBRARY_`.
  - `NativeLibraryError` is now exported only from `@jsprismarine/errors/native-library`, so one `instanceof` check catches loading errors from either package.
  - `@jsprismarine/script-host/library` no longer exports `localBuildDigest`, `recordLocalBuild` or the `LocateOptions` type. `LocateOptions` comes from `@jsprismarine/native-library`, and `NativeLibrary` covers what the other two did.
  - `@jsprismarine/script-host/manifest` is removed. Import the manifest parser from `@jsprismarine/native-library/manifest`.
  - In a checkout, `@jsprismarine/native-network` on a platform without a published build now says how to build the library instead of saying no build is published.
  
  A packager's `libraryForPlatform` now replaces an installed file that fails its digest check with the published build instead of throwing. In a checkout whose native sources differ from the published builds, nothing is downloaded, so it still throws there.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0-unstable-20261121134751
