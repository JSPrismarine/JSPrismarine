# @jsprismarine/server

## 0.4.3

### Patch Changes

- Updated dependencies [[`b0a232b`](https://github.com/JSPrismarine/JSPrismarine/commit/b0a232b9be5d6456c33d5300582a0c7e33d76a6e)]:
  - @jsprismarine/prismarine@0.4.3
  - @jsprismarine/color-parser@0.4.3
  - @jsprismarine/logger@0.4.3
  - @jsprismarine/raknet@0.4.3

## 0.4.2

### Patch Changes

- [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

- Updated dependencies [[`384f571`](https://github.com/JSPrismarine/JSPrismarine/commit/384f5716d593f2f3bac4a9521578d32107e671a8), [`7d7283b`](https://github.com/JSPrismarine/JSPrismarine/commit/7d7283ba87e6fc030d25be8a2a542745a5c94745), [`a66c1b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a66c1b981698fa26570bb0fd9ebf667240a172b7), [`b54350e`](https://github.com/JSPrismarine/JSPrismarine/commit/b54350eb6341fc487b05781b149c148bae3a5f55), [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4)]:
  - @jsprismarine/prismarine@0.4.2
  - @jsprismarine/logger@0.4.2
  - @jsprismarine/color-parser@0.4.2
  - @jsprismarine/raknet@0.4.2

## 0.4.1

### Patch Changes

- [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix stdin on Windows.
  Add input history.
  Improve exit reliability.
- Updated dependencies [[`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6), [`8bc4525`](https://github.com/JSPrismarine/JSPrismarine/commit/8bc452534b5048b71a08e509d2823203bf07a407), [`e1ba6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/e1ba6e71a2757cd6bba00c95d15d0d672c8cf476), [`69dae84`](https://github.com/JSPrismarine/JSPrismarine/commit/69dae84d2fde2bb754442f58a85dc4a865e28966)]:
  - @jsprismarine/prismarine@0.4.1
  - @jsprismarine/raknet@0.4.1

## 0.4.0

### Minor Changes

- [#1280](https://github.com/JSPrismarine/JSPrismarine/pull/1280) [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `.env` support (support `.local` and `.development` suffixes).

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

- [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `Server.instance`.
  - Remove passing of version from `@jsprismarine/server` to `@jsprismarine/prismarine`.
- Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589), [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425), [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb)]:
  - @jsprismarine/prismarine@0.4.0
  - @jsprismarine/raknet@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/prismarine@0.3.0
  - @jsprismarine/raknet@0.3.0

## 0.2.0

### Minor Changes

- [`2859dd2`](https://github.com/JSPrismarine/JSPrismarine/commit/2859dd2d9052fe7da9c222c6cab908412fce223e) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `async-exit-hook`.

  - It got in the way of `@jsprismarine/prismarine`.

- [#1249](https://github.com/JSPrismarine/JSPrismarine/pull/1249) [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `@jsprismarine/updater`.
  - We don't need an updater at the moment, in the future that job should probably be up to npm/jsr/etc.

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

- Updated dependencies [[`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf), [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1), [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f), [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122)]:
  - @jsprismarine/prismarine@0.2.0
  - @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- Updated dependencies [[`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd), [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30), [`ff73b13`](https://github.com/JSPrismarine/JSPrismarine/commit/ff73b133659cf83e01a751b0e8bfbcfe56f88346), [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395), [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a), [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716), [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
  - @jsprismarine/prismarine@0.1.1
  - @jsprismarine/updater@0.1.1
  - @jsprismarine/raknet@0.1.1

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
  - The build system has been refactored to support both esm and cjs.
  - Releases are now managed by changeset.
- Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
  - @jsprismarine/prismarine@0.1.0
  - @jsprismarine/updater@0.1.0
  - @jsprismarine/raknet@0.1.0
