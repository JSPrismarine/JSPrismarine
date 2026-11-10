# @jsprismarine/kernel

## 0.20.0

### Patch Changes

- [#2945](https://github.com/JSPrismarine/JSPrismarine/pull/2945) [`e65baae`](https://github.com/JSPrismarine/JSPrismarine/commit/e65baae41fad94186ed958d224c01592d9847eb0) Thanks [@filiphsps](https://github.com/filiphsps)! - `Kernel.start()` no longer leaves modules running when one fails to start. The modules that had started are stopped in reverse order, the kernel returns to registered so `start()` can run again, and the error is rethrown.

- [#2945](https://github.com/JSPrismarine/JSPrismarine/pull/2945) [`bbcb98e`](https://github.com/JSPrismarine/JSPrismarine/commit/bbcb98ec61ebf0a5deb2c48d64b20cfd13b39321) Thanks [@filiphsps](https://github.com/filiphsps)! - `Kernel.stop()` called while `start()` is still running now stops the modules started so far and the one still starting, so a long start such as a world preload can be cancelled. The pending `start()` rejects with a `KernelError` and starts nothing further. It used to be a no-op until the start finished.

## 0.19.2

No changes in this release.

## 0.19.1

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

No changes in this release.
