# @jsprismarine/prismarine

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

- [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `Server.instance`.

  - Remove passing of version from `@jsprismarine/server` to `@jsprismarine/prismarine`.

- [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve `js/insecure-randomness`.

- [#1280](https://github.com/JSPrismarine/JSPrismarine/pull/1280) [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix bug resulting in config sometimes being null.
  Fix cases where stdin would continue being held by the process.
  Fix `isConsole` util function on `Entity`.
  Improve console logging.
- Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`52a041c`](https://github.com/JSPrismarine/JSPrismarine/commit/52a041cfa567842ea77196c10434eb42aa9f791b)]:
  - @jsprismarine/color-parser@0.4.0
  - @jsprismarine/errors@0.4.0
  - @jsprismarine/raknet@0.4.0
  - @jsprismarine/nbt@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/color-parser@0.3.0
  - @jsprismarine/errors@0.3.0
  - @jsprismarine/nbt@0.3.0
  - @jsprismarine/raknet@0.3.0

## 0.2.0

### Minor Changes

- [#1251](https://github.com/JSPrismarine/JSPrismarine/pull/1251) [`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove `experimental-flags`.

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

- [#1249](https://github.com/JSPrismarine/JSPrismarine/pull/1249) [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `@jsprismarine/updater`.

  - We don't need an updater at the moment, in the future that job should probably be up to npm/jsr/etc.

- [#1252](https://github.com/JSPrismarine/JSPrismarine/pull/1252) [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix running a command using it's full ID (`/minecraft:help`).

- Updated dependencies [[`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1)]:
  - @jsprismarine/color-parser@0.2.0
  - @jsprismarine/errors@0.2.0
  - @jsprismarine/nbt@0.2.0
  - @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

- [`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add safety checks and fix invalid logic.

- [#1231](https://github.com/JSPrismarine/JSPrismarine/pull/1231) [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `EvalCommand`.

  - It was potentially if not already a security risk.
  - We could potentially add something similar running under a virtual environment in the future, but not a priority at the moment.
  - Fix and substantially improve stdin/tty.
    - There are still ways to go, but it's a lot better now.

- [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix `level.json` loading.

- [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix issue with some commands failing due to a `getParameters()` call.

- [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly improve circular-dep hell.

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- Updated dependencies [[`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
  - @jsprismarine/color-parser@0.1.1
  - @jsprismarine/raknet@0.1.1
  - @jsprismarine/nbt@0.1.1

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
  - The build system has been refactored to support both esm and cjs.
  - Releases are now managed by changeset.
- Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
  - @jsprismarine/color-parser@0.1.0
  - @jsprismarine/raknet@0.1.0
  - @jsprismarine/nbt@0.1.0
