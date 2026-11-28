# @jsprismarine/native-network

## 0.27.0

### Patch Changes

- [#3743](https://github.com/JSPrismarine/JSPrismarine/pull/3743) [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3758](https://github.com/JSPrismarine/JSPrismarine/pull/3758) [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies
- Updated dependencies [[`44c0251`](https://github.com/JSPrismarine/JSPrismarine/commit/44c02515fa4810e75de3185001a8490aa7766ebd), [`c836dac`](https://github.com/JSPrismarine/JSPrismarine/commit/c836dac76a41e697fb7c8d1594224cdaf5cdbece), [`edb1160`](https://github.com/JSPrismarine/JSPrismarine/commit/edb116075c62fa251747acaf9d6db80bf1b448c4), [`3a7e94b`](https://github.com/JSPrismarine/JSPrismarine/commit/3a7e94b89acda05d76e99409711ea15afd122c0f), [`88fc786`](https://github.com/JSPrismarine/JSPrismarine/commit/88fc78645d05b732a620dbfcc6ee2a106950c093), [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816), [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc), [`ffb86ad`](https://github.com/JSPrismarine/JSPrismarine/commit/ffb86ad9e67431eeb9f1568ea66758a5cbffd050), [`cf7fe3c`](https://github.com/JSPrismarine/JSPrismarine/commit/cf7fe3c485a52482dcdbda6da2f822749b256f36), [`7756f1c`](https://github.com/JSPrismarine/JSPrismarine/commit/7756f1c349bb40b381252a231d6fd4b6518ae997), [`6580502`](https://github.com/JSPrismarine/JSPrismarine/commit/6580502b8aa1bab3091d98d581fd3501d5049b36), [`832bd7b`](https://github.com/JSPrismarine/JSPrismarine/commit/832bd7b2e1237f1cc98622cdcb1c21a3a6d37503), [`68a0e1b`](https://github.com/JSPrismarine/JSPrismarine/commit/68a0e1b820981bab5d69830066d824ca937e1021), [`14aeb2c`](https://github.com/JSPrismarine/JSPrismarine/commit/14aeb2cf0b75913f02907de47112af392f517d53), [`c35144a`](https://github.com/JSPrismarine/JSPrismarine/commit/c35144acb33d5b1a6237c523595df8674e349a0f), [`0cd4ddb`](https://github.com/JSPrismarine/JSPrismarine/commit/0cd4ddb62d4a05f212368dbca7f217a8bb3a7f08), [`37722e2`](https://github.com/JSPrismarine/JSPrismarine/commit/37722e2d12c913328b9dfa9776e70b6300868d5e), [`dfe4b85`](https://github.com/JSPrismarine/JSPrismarine/commit/dfe4b85f7b9c075988d0231f4fb48e572e332ce1)]:
  - @jsprismarine/errors@0.27.0
  - @jsprismarine/native-library@0.27.0

## 0.26.0

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies
- Updated dependencies [[`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b)]:
  - @jsprismarine/errors@0.26.0
  - @jsprismarine/native-library@0.26.0

## 0.25.0

### Patch Changes

- [`c91513b`](https://github.com/JSPrismarine/JSPrismarine/commit/c91513ba1a3d9cfafc6740c2852b78915f8caf46) Thanks [@filiphsps](https://github.com/filiphsps)! - `pnpm dev` runs the new `ensure:native` script, which downloads the NetherNet library build the manifest pins when the installed one is older, as after a `git pull` that moved the pin. The server no longer stops with a checksum error after such a pull.

- [`5c7addc`](https://github.com/JSPrismarine/JSPrismarine/commit/5c7addcfef78e8fa52f9383bef765a22c1264af2) Thanks [@filiphsps](https://github.com/filiphsps)! - In a checkout, `ensure:native` loads the installer from the package's TypeScript sources even when a build is present. Loading the build failed, because its `@jsprismarine/native-library` import resolved to that package's sources, which Node cannot load without tsx. The script reported the error and left the old library in place, so `pnpm dev` stopped with a checksum error after a pull that moved the pin.
- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/native-library@0.25.0

## 0.24.0

### Minor Changes

- [#3558](https://github.com/JSPrismarine/JSPrismarine/pull/3558) [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/native-network` now binds its library through `@jsprismarine/native-library/ffi`'s `bindNative`, and `@jsprismarine/script-host` loads `node:ffi` through its new `nodeFfi()`. Each package had kept its own copy of that code.
  
  Breaking: `NativeNetworkErrors.FfiUnavailable` and `ScriptHostErrors.FfiUnavailable` are removed. A runtime without `node:ffi` now throws `NativeLibraryErrors.FfiUnavailable`, which is still a `NativeLibraryError`, so an `instanceof NativeLibraryError` check still catches it.

- [#3513](https://github.com/JSPrismarine/JSPrismarine/pull/3513) [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-library`, which finds, checks and installs a package's prebuilt native library. `@jsprismarine/native-network` and `@jsprismarine/script-host` now load their libraries through it, so both behave the same way.
  
  Breaking changes:
  
  - The errors for a missing, unverified or undownloadable library, and for a malformed native manifest (`InvalidNativeManifest`, `InvalidNativeManifestEntry`), moved from `NativeNetworkErrors` and `ScriptHostErrors` to `NativeLibraryErrors` in `@jsprismarine/errors/native-library`, and their codes now start with `NATIVE_LIBRARY_`.
  - `NativeLibraryError` is now exported only from `@jsprismarine/errors/native-library`, so one `instanceof` check catches loading errors from either package.
  - `@jsprismarine/script-host/library` no longer exports `localBuildDigest`, `recordLocalBuild` or the `LocateOptions` type. `LocateOptions` comes from `@jsprismarine/native-library`, and `NativeLibrary` covers what the other two did.
  - `@jsprismarine/script-host/manifest` is removed. Import the manifest parser from `@jsprismarine/native-library/manifest`.
  - In a checkout, `@jsprismarine/native-network` on a platform without a published build now says how to build the library instead of saying no build is published.
  
  A packager's `libraryForPlatform` now replaces an installed file that fails its digest check with the published build instead of throwing. In a checkout whose native sources differ from the published builds, nothing is downloaded, so it still throws there.

### Patch Changes

- [`e1f36b8`](https://github.com/JSPrismarine/JSPrismarine/commit/e1f36b83616149c2e27f4276d423cdb6f43e3ed6) Thanks [@filiphsps](https://github.com/filiphsps)! - The native source hash now covers what `@jsprismarine/native-library`'s naming helpers return instead of the text of their module, and leaves out the modules that only compute the hash. Editing those modules without changing a build no longer publishes new builds, and in a checkout no longer makes the library build locally. `nativeSourceHash` takes the helpers' output as a third argument, from the new `namingAnswers` in `@jsprismarine/native-library/platform`.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`e1f36b8`](https://github.com/JSPrismarine/JSPrismarine/commit/e1f36b83616149c2e27f4276d423cdb6f43e3ed6), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/native-library@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3341](https://github.com/JSPrismarine/JSPrismarine/pull/3341) [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse to load the native networking library on a Node.js without `node:ffi`, such as one started with `--no-experimental-ffi`, with a `NativeLibraryError` that names the requirement. It used to fail at `dlopen` with `TypeError: Cannot read properties of undefined`. `NativeNetworkErrors.FfiUnavailable` is the new catalog entry.

- [`8d2ba21`](https://github.com/JSPrismarine/JSPrismarine/commit/8d2ba2182f5887cc4c604156a1651051a6fedbe6) Thanks [@filiphsps](https://github.com/filiphsps)! - The message shown when the library's build is missing tells npm users to run `npm install-scripts approve @jsprismarine/native-network`, then `npm rebuild @jsprismarine/native-network`. npm 12 skips a dependency's install script until the project approves it, so the old `npm rebuild` advice alone did nothing.

- [#3380](https://github.com/JSPrismarine/JSPrismarine/pull/3380) [`86b7426`](https://github.com/JSPrismarine/JSPrismarine/commit/86b74266baedb4972a2b89a2390264589eb85cf5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PeerConnection.roundTripTime()` reads the SCTP association's smoothed round trip time, through the library's new `jsp_pc_round_trip_time`. A library built before that call still loads, and its connections answer `undefined`.

- [`ae489bc`](https://github.com/JSPrismarine/JSPrismarine/commit/ae489bc33e7df476d7166a15729cb4af8d8cf262) Thanks [@filiphsps](https://github.com/filiphsps)! - A connectivity check's error response with code 401, 420 or 500 no longer fails the candidate pair. Bedrock Dedicated Server answers a check from more than one of its agents, with a success and then a 401, and that 401 dropped NetherNet clients a few seconds after they joined it.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/script-host` and `@jsprismarine/script-types` are published to npm. The script host's install script downloads the QuickJS library built for the machine, on macOS on Apple silicon, Windows on x64, and Linux on x64 and arm64 with glibc or musl, and checks its SHA-256, so scripts run on an installed server without a compiler. `JSP_SCRIPT_HOST_LIBRARY` names a library file to load instead.
  
  `ScriptHostErrors.LibraryNotBuilt` is replaced by `LibraryNotInstalled`, whose message says how to approve the install script for npm, pnpm or Bun. New entries cover a failed or corrupt download, a malformed manifest, and a library that is not the published build.
  
  `@jsprismarine/native-network` exports `PUBLISHED_PLATFORMS`, the platforms it publishes builds for.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0

## 0.22.0

### Patch Changes

- [`b79964d`](https://github.com/JSPrismarine/JSPrismarine/commit/b79964d727c920cba3537d26dae40a3d9a937c81) Thanks [@filiphsps](https://github.com/filiphsps)! - Record an executable's embedded library's digest beside the copy it extracts, as a local `build:native` records its build. An executable built from native sources the manifest does not publish yet refused the library embedded in it.

## 0.21.0

### Patch Changes

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`f64fee1`](https://github.com/JSPrismarine/JSPrismarine/commit/f64fee173c2ceec52534f2d3f1632ca6ae298797) Thanks [@filiphsps](https://github.com/filiphsps)! - A NetherNet connection that closes delivers everything sent before it. The native peer connection is deleted only once libdatachannel reports it closed, after its graceful SCTP shutdown, and a connection whose unreliable channel or peer connection goes down first waits for the reliable channel's own close, which comes after its last message. The server no longer waits before it closes a kicked player's connection.

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#3065](https://github.com/JSPrismarine/JSPrismarine/pull/3065) [`3c028c9`](https://github.com/JSPrismarine/JSPrismarine/commit/3c028c978f5fc50db06c5bc099aff441b650d714) Thanks [@filiphsps](https://github.com/filiphsps)! - Give each checkout its own CMake build directory, so `build:native` works in a git worktree whose shared cache holds another checkout's build.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`6a29967`](https://github.com/JSPrismarine/JSPrismarine/commit/6a29967baa7fe9bc44acad762e651a4964af037b) Thanks [@filiphsps](https://github.com/filiphsps)! - The native networking library stays loaded for the life of the process, so a worker thread that loaded it can exit while libdatachannel's threads keep running, where the process used to crash on exit.

- [`59f5789`](https://github.com/JSPrismarine/JSPrismarine/commit/59f5789776b57cdcba02bae18ff85b811ad232bc) Thanks [@filiphsps](https://github.com/filiphsps)! - The library logs warnings and worse unless a load asks for another level, and a line logged during a call goes to the queue of the thread that made it. `NativeNetwork.flushLog` hands queued log lines to the log handler at once and defers the other events to the next turn of the event loop, so a failed call can read what it logged.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`4cd0308`](https://github.com/JSPrismarine/JSPrismarine/commit/4cd0308e0a6f2733e21dc239107323bd79b0d70a) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/native-network` downloads the build of its library for the machine it is installed on, from a GitHub release, in its install script, checks the file's SHA-256 against its manifest, and stores it in the package. Loading checks the file again and downloads nothing; without a build it fails with how to let npm, pnpm or Bun run the install script. `JSP_NATIVE_NETWORK_LIBRARY` names another file to load, checked the same way.
  
  The single executables carry their platform's library and write it to their cache directory on the first start.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`7ad176f`](https://github.com/JSPrismarine/JSPrismarine/commit/7ad176f908b8c7946773fa9fa2a942f6ac3cbd45) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-network`, JSPrismarine's networking in native code: WebRTC peer connections and data channels on libdatachannel with Mbed TLS, bound through `node:ffi` and `bun:ffi`, and `SharedPort`, a UDP port that RakNet and NetherNet share, sorted by each datagram's bytes before libjuice's lookup. This release builds from source only; prebuilt libraries follow.
  
  `SharedByteRing` in `@jsprismarine/raknet` now has eight control slots, with a wake flag (`claimWake` and `clearWake`), and needs a power-of-two capacity, so native code can read and write the same rings. A ring made with any other capacity is refused.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`763c07d`](https://github.com/JSPrismarine/JSPrismarine/commit/763c07d5467a638658db0187110d2615160fdd19) Thanks [@filiphsps](https://github.com/filiphsps)! - RakNet and NetherNet can share one UDP port. When `server-udp-ports` covers `port` or `server-portv6` and both transports are on, the native networking library owns the port, sorts each datagram by its bytes, and hands RakNet its datagrams through shared-memory rings, in socket mode and with the RakNet worker.
  
  With RakNet off, the server port is opened the same way when NetherNet's UDP is on it, so a taken port stops the start, and query, when `query-port` is the server port, answers through it instead of binding a socket that would keep NetherNet's peers off the port.
  
  `@jsprismarine/raknet` adds `DatagramSource`, with `UdpDatagramSource` and `RingDatagramSource`, and `ServerSocket` and `WorkerServerSocket` take one as a new last constructor argument. `@jsprismarine/native-network`'s `SharedPort.attach` takes the rings to fill instead of allocating them.
