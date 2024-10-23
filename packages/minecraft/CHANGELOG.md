# @jsprismarine/minecraft

## 0.8.0

### Minor Changes

-   [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

-   [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

-   Updated dependencies [[`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    -   @jsprismarine/errors@0.8.0
    -   @jsprismarine/nbt@0.8.0

## 0.7.0

### Patch Changes

-   Updated dependencies []:
    -   @jsprismarine/errors@0.7.0
    -   @jsprismarine/nbt@0.7.0

## 0.6.0

### Patch Changes

-   Updated dependencies []:
    -   @jsprismarine/errors@0.6.0
    -   @jsprismarine/nbt@0.6.0

## 0.5.0

### Patch Changes

-   [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

-   [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve `Gametype` parsing.

-   Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53)]:
    -   @jsprismarine/errors@0.5.0
    -   @jsprismarine/nbt@0.5.0

## 0.4.5

### Patch Changes

-   [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

-   [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

-   Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    -   @jsprismarine/nbt@0.4.5

## 0.4.4

### Patch Changes

-   [`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a) Thanks [@filiphsps](https://github.com/filiphsps)! - Migrate to @jsprismarine/Minecraft's `gametype`.

-   Updated dependencies []:
    -   @jsprismarine/nbt@0.4.4
