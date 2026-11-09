# @jsprismarine/console-protocol

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/logger@0.19.0

## 0.18.0

### Patch Changes

- [`9e700bc`](https://github.com/JSPrismarine/JSPrismarine/commit/9e700bc950005d45861cdab21e82a6f5612ce883) Thanks [@filiphsps](https://github.com/filiphsps)! - The console follows a server's own tick rate. The `status` message carries an optional `tickRate`, and the server sends it, so a rate set with `/tick rate` reaches the console. The console caps TPS at that rate instead of 20, colors TPS and tick time against it, and draws the TPS page's graph up to the highest rate in the chosen span, so a span that includes a rate change shows the higher one. A console that gets no `tickRate` assumes 20.

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/logger@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`8cced47`](https://github.com/JSPrismarine/JSPrismarine/commit/8cced47f85ef42f2758be9b45ec07374485bcc32), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`fa402ef`](https://github.com/JSPrismarine/JSPrismarine/commit/fa402ef47f444451ea3b4d687b5451e3e0decc05), [`b79f018`](https://github.com/JSPrismarine/JSPrismarine/commit/b79f018812a78f61fc9af2c29ec094c351c15a9e), [`1b01a18`](https://github.com/JSPrismarine/JSPrismarine/commit/1b01a18f03fb8f751011330535a7f20f0cf10369)]:
  - @jsprismarine/logger@0.17.0

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve console dashboard, TPS graph, and severity indicators

- [#2622](https://github.com/JSPrismarine/JSPrismarine/pull/2622) [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/console`, the OpenTUI terminal interface the server loads on a Node that provides `node:ffi` (pins `@opentui/core` 0.6.8 exactly), and `@jsprismarine/console-protocol`, the message types and IPC links the server and console use to talk.
- Updated dependencies [[`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f)]:
  - @jsprismarine/logger@0.16.0
