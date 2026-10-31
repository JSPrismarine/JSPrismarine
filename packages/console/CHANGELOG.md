# @jsprismarine/console

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9a3a388`](https://github.com/JSPrismarine/JSPrismarine/commit/9a3a3889a770aedc72e51f93d68f52a04834c13a) Thanks [@filiphsps](https://github.com/filiphsps)! - Support copying selected text in the TUI console

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix console input, logs, source links, and overlay dismissal

- [#2640](https://github.com/JSPrismarine/JSPrismarine/pull/2640) [`9ec7987`](https://github.com/JSPrismarine/JSPrismarine/commit/9ec7987556bef405565d37f54338d03b26a54e32) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix TUI copy and paste, and collapse repeated log lines

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve status filters and help, group namespaces, and preserve log position across popups

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve console dashboard, TPS graph, and severity indicators

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7d2a109`](https://github.com/JSPrismarine/JSPrismarine/commit/7d2a109a0e68793f61147f6efd95f7570a542e80) Thanks [@filiphsps](https://github.com/filiphsps)! - Size help columns using their shared key width so shortcut titles remain visible, and truncate single-row labels without wrapping.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`456ba80`](https://github.com/JSPrismarine/JSPrismarine/commit/456ba80b5a1749d9ade8bc8d4edff3f5d2207f2a) Thanks [@filiphsps](https://github.com/filiphsps)! - Make console shortcuts available from the log pane and toggle focus with Escape.

- [#2622](https://github.com/JSPrismarine/JSPrismarine/pull/2622) [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/console`, the OpenTUI terminal interface the server loads on a Node that provides `node:ffi` (pins `@opentui/core` 0.6.8 exactly), and `@jsprismarine/console-protocol`, the message types and IPC links the server and console use to talk.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6266c68`](https://github.com/JSPrismarine/JSPrismarine/commit/6266c682e9557dd635c3bba175f595426c90a1be) Thanks [@filiphsps](https://github.com/filiphsps)! - Copy wrapped log selections without display indentation or soft line breaks, preserve full URL targets across wrapped rows, and open wrapped source references correctly.
- Updated dependencies [[`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75), [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f), [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f)]:
  - @jsprismarine/console-protocol@0.16.0
  - @jsprismarine/logger@0.16.0
