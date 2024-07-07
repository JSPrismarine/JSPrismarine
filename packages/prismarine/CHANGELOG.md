# @jsprismarine/prismarine

## 0.5.0

### Minor Changes

-   [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `GameType` to `Gametype` (parity fix).

### Patch Changes

-   [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

-   [`3a00892`](https://github.com/JSPrismarine/JSPrismarine/commit/3a00892ab6d8e0647c94da96bb85553f08a8484b) Thanks [@filiphsps](https://github.com/filiphsps)! - Protocol changes.

-   Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53), [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1)]:
    -   @jsprismarine/color-parser@0.5.0
    -   @jsprismarine/minecraft@0.5.0
    -   @jsprismarine/protocol@0.5.0
    -   @jsprismarine/errors@0.5.0
    -   @jsprismarine/logger@0.5.0
    -   @jsprismarine/raknet@0.5.0
    -   @jsprismarine/math@0.5.0
    -   @jsprismarine/nbt@0.5.0

## 0.4.5

### Patch Changes

-   [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

-   [#1458](https://github.com/JSPrismarine/JSPrismarine/pull/1458) [`2d32a17`](https://github.com/JSPrismarine/JSPrismarine/commit/2d32a17c994a3cbd3d98d94dd0f33280a863c81a) Thanks [@filiphsps](https://github.com/filiphsps)! - As a parity change with Java and BDS the console will no longer require
    you to type a `/` (slash) before running a command. As a consequence of
    this change the chat functionality of the console has been removed, to
    send chat messages now you will need to use one of the many commands
    like `/say`, `/me`, `/tellraw`, and more.

    All on `enable` and `disable` hooks have now been documented with JSDoc
    and also given proper return types.

-   [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

-   Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    -   @jsprismarine/color-parser@0.4.5
    -   @jsprismarine/minecraft@0.4.5
    -   @jsprismarine/protocol@0.4.5
    -   @jsprismarine/errors@0.4.5
    -   @jsprismarine/logger@0.4.5
    -   @jsprismarine/raknet@0.4.5
    -   @jsprismarine/math@0.4.5
    -   @jsprismarine/nbt@0.4.5

## 0.4.4

### Patch Changes

-   [`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a) Thanks [@filiphsps](https://github.com/filiphsps)! - Migrate to @jsprismarine/Minecraft's `gametype`.

-   [`2b5bc2f`](https://github.com/JSPrismarine/JSPrismarine/commit/2b5bc2fbffe777c329fd5684e342050cd2e13c43) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Blocks in negative coordinates don't behave correctly." [#1328](https://github.com/JSPrismarine/JSPrismarine/issues/1328).

-   [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move `pitch`, `yaw` and `headYaw` to `Entity`.

-   [#1334](https://github.com/JSPrismarine/JSPrismarine/pull/1334) [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Take advantage of raknet/src/utils/ServerName.ts." [#1313](https://github.com/JSPrismarine/JSPrismarine/issues/1313).

-   [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix spawn location.
    Send entity metadata to clients.
    Slightly Simplify working with positions.
-   Updated dependencies [[`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a), [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7)]:
    -   @jsprismarine/minecraft@0.4.4
    -   @jsprismarine/raknet@0.4.4
    -   @jsprismarine/protocol@0.4.4
    -   @jsprismarine/color-parser@0.4.4
    -   @jsprismarine/errors@0.4.4
    -   @jsprismarine/logger@0.4.4
    -   @jsprismarine/math@0.4.4
    -   @jsprismarine/nbt@0.4.4

## 0.4.3

### Patch Changes

-   [`b0a232b`](https://github.com/JSPrismarine/JSPrismarine/commit/b0a232b9be5d6456c33d5300582a0c7e33d76a6e) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump version due to previous publishing failure.

-   Updated dependencies []:
    -   @jsprismarine/color-parser@0.4.3
    -   @jsprismarine/errors@0.4.3
    -   @jsprismarine/logger@0.4.3
    -   @jsprismarine/nbt@0.4.3
    -   @jsprismarine/raknet@0.4.3

## 0.4.2

### Patch Changes

-   [#1299](https://github.com/JSPrismarine/JSPrismarine/pull/1299) [`384f571`](https://github.com/JSPrismarine/JSPrismarine/commit/384f5716d593f2f3bac4a9521578d32107e671a8) Thanks [@filiphsps](https://github.com/filiphsps)! - CommandManager: Remove legacy `execute` function.

-   [#1303](https://github.com/JSPrismarine/JSPrismarine/pull/1303) [`7d7283b`](https://github.com/JSPrismarine/JSPrismarine/commit/7d7283ba87e6fc030d25be8a2a542745a5c94745) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `onEnable` and `onDisable` to `enable` and `disable`.

-   [#1312](https://github.com/JSPrismarine/JSPrismarine/pull/1312) [`a66c1b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a66c1b981698fa26570bb0fd9ebf667240a172b7) Thanks [@filiphsps](https://github.com/filiphsps)! - Entity: Refactor Metadata to be more user-friendly.

-   [#1299](https://github.com/JSPrismarine/JSPrismarine/pull/1299) [`b54350e`](https://github.com/JSPrismarine/JSPrismarine/commit/b54350eb6341fc487b05781b149c148bae3a5f55) Thanks [@filiphsps](https://github.com/filiphsps)! - World: Simplify `LevelData` handling.
    WorldManager: Improve `isWorldLoaded` check.
    Entities: Simplify.
    Player: Move UUID handling to `Entity`.

-   [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

-   Updated dependencies [[`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4)]:
    -   @jsprismarine/logger@0.4.2
    -   @jsprismarine/color-parser@0.4.2
    -   @jsprismarine/errors@0.4.2
    -   @jsprismarine/nbt@0.4.2
    -   @jsprismarine/raknet@0.4.2

## 0.4.1

### Patch Changes

-   [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix stdin on Windows.
    Add input history.
    Improve exit reliability.

-   [#1292](https://github.com/JSPrismarine/JSPrismarine/pull/1292) [`8bc4525`](https://github.com/JSPrismarine/JSPrismarine/commit/8bc452534b5048b71a08e509d2823203bf07a407) Thanks [@filiphsps](https://github.com/filiphsps)! - Refactor `Server` to extend our custom `EventEmitter`.
    So, instead of using the `getEventManager()` function to get something emittable;
    you now just do a simple `server.emit('id', event);`.

-   [`e1ba6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/e1ba6e71a2757cd6bba00c95d15d0d672c8cf476) Thanks [@filiphsps](https://github.com/filiphsps)! - Refactor Chat constructor.

-   [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`69dae84`](https://github.com/JSPrismarine/JSPrismarine/commit/69dae84d2fde2bb754442f58a85dc4a865e28966) Thanks [@filiphsps](https://github.com/filiphsps)! - Add basic tab-completion support.

-   Updated dependencies []:
    -   @jsprismarine/color-parser@0.4.1
    -   @jsprismarine/errors@0.4.1
    -   @jsprismarine/nbt@0.4.1
    -   @jsprismarine/raknet@0.4.1

## 0.4.0

### Patch Changes

-   [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

-   [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `Server.instance`.

    -   Remove passing of version from `@jsprismarine/server` to `@jsprismarine/prismarine`.

-   [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve `js/insecure-randomness`.

-   [#1280](https://github.com/JSPrismarine/JSPrismarine/pull/1280) [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix bug resulting in config sometimes being null.
    Fix cases where stdin would continue being held by the process.
    Fix `isConsole` util function on `Entity`.
    Improve console logging.
-   Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`52a041c`](https://github.com/JSPrismarine/JSPrismarine/commit/52a041cfa567842ea77196c10434eb42aa9f791b)]:
    -   @jsprismarine/color-parser@0.4.0
    -   @jsprismarine/errors@0.4.0
    -   @jsprismarine/raknet@0.4.0
    -   @jsprismarine/nbt@0.4.0

## 0.3.0

### Patch Changes

-   Updated dependencies []:
    -   @jsprismarine/color-parser@0.3.0
    -   @jsprismarine/errors@0.3.0
    -   @jsprismarine/nbt@0.3.0
    -   @jsprismarine/raknet@0.3.0

## 0.2.0

### Minor Changes

-   [#1251](https://github.com/JSPrismarine/JSPrismarine/pull/1251) [`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove `experimental-flags`.

### Patch Changes

-   [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

-   [#1249](https://github.com/JSPrismarine/JSPrismarine/pull/1249) [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `@jsprismarine/updater`.

    -   We don't need an updater at the moment, in the future that job should probably be up to npm/jsr/etc.

-   [#1252](https://github.com/JSPrismarine/JSPrismarine/pull/1252) [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix running a command using it's full ID (`/minecraft:help`).

-   Updated dependencies [[`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1)]:
    -   @jsprismarine/color-parser@0.2.0
    -   @jsprismarine/errors@0.2.0
    -   @jsprismarine/nbt@0.2.0
    -   @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

-   [`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add safety checks and fix invalid logic.

-   [#1231](https://github.com/JSPrismarine/JSPrismarine/pull/1231) [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `EvalCommand`.

    -   It was potentially if not already a security risk.
    -   We could potentially add something similar running under a virtual environment in the future, but not a priority at the moment.
    -   Fix and substantially improve stdin/tty.
        -   There are still ways to go, but it's a lot better now.

-   [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix `level.json` loading.

-   [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix issue with some commands failing due to a `getParameters()` call.

-   [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly improve circular-dep hell.

-   [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

-   Updated dependencies [[`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
    -   @jsprismarine/color-parser@0.1.1
    -   @jsprismarine/raknet@0.1.1
    -   @jsprismarine/nbt@0.1.1

## 0.1.0

### Patch Changes

-   [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    -   The build system has been refactored to support both esm and cjs.
    -   Releases are now managed by changeset.
-   Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
    -   @jsprismarine/color-parser@0.1.0
    -   @jsprismarine/raknet@0.1.0
    -   @jsprismarine/nbt@0.1.0
