# @jsprismarine/kernel

## 0.21.0

### Minor Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce11043`](https://github.com/JSPrismarine/JSPrismarine/commit/ce110434d734050dc3ac0286428ff9ed787396e8) Thanks [@filiphsps](https://github.com/filiphsps)! - The kernel's event bus gains `post`, `once`, `off`, `removeAll` and `hasListeners`. `post` calls each listener in subscription order without waiting for any of them. A listener that throws or rejects no longer stops the listeners after it or makes `emit` reject: the bus reports it, and a kernel logs it through its logger. Subscribing the same function to the same event twice through one handle subscribes it once. A listener may return any value. Code that implements `EventBus` itself has to add the new methods.

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`51588cc`](https://github.com/JSPrismarine/JSPrismarine/commit/51588cccb408a3f95ab31d920849e1b5327429d2) Thanks [@filiphsps](https://github.com/filiphsps)! - Subscribing a function with `once` and then with `on` no longer leaves it one-shot. The bus keeps one subscription per function and handle, and an `on` in either order now makes that subscription permanent, so the function is called on every event until `off` removes it. Before, `once` followed by `on` called the function for the next event only.

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
