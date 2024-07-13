# @jsprismarine/client

## 0.6.0

### Minor Changes

-   [`e7296ed`](https://github.com/JSPrismarine/JSPrismarine/commit/e7296edd74198c5bed6732424a74829d9c0fad46) Thanks [@qwqtoday](https://github.com/qwqtoday)! - Fix types in Brigadier.

## 0.5.0

### Patch Changes

-   [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

## 0.4.5

### Patch Changes

-   [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

-   [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

## 0.4.4

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Patch Changes

-   [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

## 0.3.0

### Minor Changes

-   [`18555da`](https://github.com/JSPrismarine/JSPrismarine/commit/18555da4a0e01bb6fe8996eef822a58bf4c18f59) Thanks [@filiphsps](https://github.com/filiphsps)! - Migrate to monorepo, this means that we now also build both `esm` and
    `cjs` versions of this package! :rocket:

## 0.1.1

### Patch Changes

-   [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

-   Updated dependencies [[`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd), [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30), [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395), [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a), [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716), [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
    -   @jsprismarine/prismarine@0.1.1
    -   @jsprismarine/raknet@0.1.1

## 0.1.0

### Patch Changes

-   [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    -   The build system has been refactored to support both esm and cjs.
    -   Releases are now managed by changeset.
-   Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
    -   @jsprismarine/prismarine@0.1.0
    -   @jsprismarine/raknet@0.1.0
