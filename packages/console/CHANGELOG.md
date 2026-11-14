# @jsprismarine/console

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2971](https://github.com/JSPrismarine/JSPrismarine/pull/2971) [`195146d`](https://github.com/JSPrismarine/JSPrismarine/commit/195146d4c79397c33eb0fcf34d0ce9b32af19908) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency @opentui/core to v0.8.4

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`1aa2c75`](https://github.com/JSPrismarine/JSPrismarine/commit/1aa2c75624bf48fbae384e920ed9ae53b2cd346c), [`888c0d0`](https://github.com/JSPrismarine/JSPrismarine/commit/888c0d05b726d51dbe9d3fbb414b1f8b5df82f36)]:
  - @jsprismarine/console-protocol@0.21.0
  - @jsprismarine/logger@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/console-protocol@0.20.0
  - @jsprismarine/logger@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/console-protocol@0.19.2
  - @jsprismarine/logger@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/console-protocol@0.19.1
  - @jsprismarine/logger@0.19.1

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/console-protocol@0.19.0
  - @jsprismarine/logger@0.19.0

## 0.18.0

### Patch Changes

- [`968a4da`](https://github.com/JSPrismarine/JSPrismarine/commit/968a4da538301cf4385da327687acc46d8de3dc0) Thanks [@filiphsps](https://github.com/filiphsps)! - Selecting text copies it only when the text is log text. Clicking a tab on the TPS page, a status bar item, or a row in the details pane used to select its label and copy it. Those labels can no longer be selected, and a finished selection is copied only when it covers log rows. Cmd+C still copies whatever is selected.

- [`bd85d23`](https://github.com/JSPrismarine/JSPrismarine/commit/bd85d232d1a28ebaebc9342100b1c87cdd872057) Thanks [@filiphsps](https://github.com/filiphsps)! - Pressing a notice in the console no longer copies it. A notice's text could be selected, so pressing it or its close button selected that text, copied it, and showed a new "copied" notice, which repeated on every dismissal. Notices can no longer be selected, and each selection is copied once.

- [`f0e5d5e`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e5d5ec4cc03a06dd45fbbaabbccaee04a20bf4) Thanks [@filiphsps](https://github.com/filiphsps)! - Copy and paste work in the console on more terminals. Cmd+C and Ctrl+Shift+C copy the selected log text or the selected command line text whichever pane has focus, and a finished mouse selection is copied at once, because many terminals keep Cmd+C for themselves while mouse reporting is on. Copies go to the system clipboard as well as to the terminal with OSC 52, so they work in terminals without OSC 52, and over SSH they go to the terminal only. Cmd+V and Ctrl+Shift+V paste the clipboard for terminals that send them as keys. A pasted block of several lines becomes one line with spaces between the lines, where it used to run the lines together.

- [`80ed872`](https://github.com/JSPrismarine/JSPrismarine/commit/80ed872bcd8e16f545291f9458344c50e23bb65a) Thanks [@filiphsps](https://github.com/filiphsps)! - The TPS graph draws a connected line. A sharp drop or recovery used to show as separate dots, and now a stroke joins neighboring readings.

- [`9e700bc`](https://github.com/JSPrismarine/JSPrismarine/commit/9e700bc950005d45861cdab21e82a6f5612ce883) Thanks [@filiphsps](https://github.com/filiphsps)! - The console follows a server's own tick rate. The `status` message carries an optional `tickRate`, and the server sends it, so a rate set with `/tick rate` reaches the console. The console caps TPS at that rate instead of 20, colors TPS and tick time against it, and draws the TPS page's graph up to the highest rate in the chosen span, so a span that includes a rate change shows the higher one. A console that gets no `tickRate` assumes 20.

- [`fd42022`](https://github.com/JSPrismarine/JSPrismarine/commit/fd4202224a1ee2c72cccca5c60759fca093f875c) Thanks [@filiphsps](https://github.com/filiphsps)! - The console never shows more than 20 TPS. A loop catching up on lost ticks reports a rate above 20, which the status bar, the details pane, and the TPS page showed as 20.84 or more and which stretched the TPS page's axis past 20. Every view now caps the reading at 20.

- [`505c613`](https://github.com/JSPrismarine/JSPrismarine/commit/505c613f8c6780b98a18aeee66adb86d31e37d24) Thanks [@filiphsps](https://github.com/filiphsps)! - The console has a TPS page. Click the TPS graph in the details pane or the TPS value in the status bar, or press T while the log has focus, to see up to 15 minutes of readings in a chart that covers the log. The page shows the latest, average, lowest, and highest TPS for a span of 1, 5, or 15 minutes, switched with the number keys, the arrow keys, or a click, and closes with T, Q, Esc, or its close control. The status bar now colors TPS green from 19, yellow from 15, and red below, and colors the tick time yellow from 40 ms and red from 50 ms. The details pane shows the lowest recent TPS and marks the graph as clickable.

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`9e700bc`](https://github.com/JSPrismarine/JSPrismarine/commit/9e700bc950005d45861cdab21e82a6f5612ce883), [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/console-protocol@0.18.0
  - @jsprismarine/logger@0.18.0

## 0.17.0

### Patch Changes

- [#2874](https://github.com/JSPrismarine/JSPrismarine/pull/2874) [`4575c6b`](https://github.com/JSPrismarine/JSPrismarine/commit/4575c6bff1f95ac48c3942c3fe923a99582f9a99) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency @opentui/core to v0.8.2
- Updated dependencies [[`8cced47`](https://github.com/JSPrismarine/JSPrismarine/commit/8cced47f85ef42f2758be9b45ec07374485bcc32), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`fa402ef`](https://github.com/JSPrismarine/JSPrismarine/commit/fa402ef47f444451ea3b4d687b5451e3e0decc05), [`b79f018`](https://github.com/JSPrismarine/JSPrismarine/commit/b79f018812a78f61fc9af2c29ec094c351c15a9e), [`1b01a18`](https://github.com/JSPrismarine/JSPrismarine/commit/1b01a18f03fb8f751011330535a7f20f0cf10369)]:
  - @jsprismarine/logger@0.17.0
  - @jsprismarine/console-protocol@0.17.0

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
