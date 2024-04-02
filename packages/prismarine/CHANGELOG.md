# @jsprismarine/prismarine

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
