# @jsprismarine/console

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/console-protocol@0.23.1
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/logger@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`3cf0be0`](https://github.com/JSPrismarine/JSPrismarine/commit/3cf0be0bed109bdb3af82eb735f2e341a2ce9d5d) Thanks [@filiphsps](https://github.com/filiphsps)! - Under `--watch`, a line above the input reports what the watcher last did: a change, a bedrock-data generation, a restart and the file that caused it, or a crash and how a save restarts the server. It replaces the notices those events raised and the dev badge in the title bar, so a restart no longer covers the log.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`ab7c12a`](https://github.com/JSPrismarine/JSPrismarine/commit/ab7c12ac31016431681266b6d194d96cbde9b09e) Thanks [@filiphsps](https://github.com/filiphsps)! - While the server starts, the side pane lists each startup step it reports, with the time each finished step took and the one still running marked, so a slow start shows where it is.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`515e0dd`](https://github.com/JSPrismarine/JSPrismarine/commit/515e0dddbc0707f48abfe49d9cd1e4a0834028da) Thanks [@filiphsps](https://github.com/filiphsps)! - The console's truecolor theme now uses the brand palette: ink background, deep panels, accent for healthy state, the new warning yellow `#f2c14e` for the warn level and states in progress, and signal for the prompt, focus and errors. The 16-color and `NO_COLOR` themes are unchanged.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`3e42eb8`](https://github.com/JSPrismarine/JSPrismarine/commit/3e42eb8b6c25909265ab2ef1a93128148a10a5b1) Thanks [@filiphsps](https://github.com/filiphsps)! - Ctrl+K opens a command palette, from the log or the command line. Typing narrows it to the console actions, server commands and online players whose names match, best match first. Enter runs an action or puts a command or a player's name on the command line. A paste while it is open goes into its search.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`4c0d192`](https://github.com/JSPrismarine/JSPrismarine/commit/4c0d192fcdef7e2b0c565c33df75933168a8daa1) Thanks [@filiphsps](https://github.com/filiphsps)! - When the server crashes, a card at the foot of the log shows how it ended, the error line and the first stack frames from what it printed, or a failure it reported after its last trace. While the command line is empty, `r` restarts it under `--watch`, `o` opens the first frame that names a file in your editor, `c` copies the trace, and Esc puts the card away.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`b278032`](https://github.com/JSPrismarine/JSPrismarine/commit/b2780329065c336cb1d0e7113a94d4c84d9a8e3f) Thanks [@filiphsps](https://github.com/filiphsps)! - The status bar no longer repeats TPS, players, tick time, memory and uptime while the side pane shows them. Its filters name what they do (`info and up`, `all sources`) and the focus hint reads `Esc to scroll` or `Esc to type`. The namespace column is 15 characters wide, so names such as `contentPayloads` fit. Verbose logging names a source location such as `world/World.js:412:17`; the column shows its file, `World`, and a click on it still opens the location. A wrapped line hangs under its own indent, so the tail of a stack frame lines up under its `at`.

- [`c91fb99`](https://github.com/JSPrismarine/JSPrismarine/commit/c91fb99cd1bd1f07dbf961a00086408bdb55a036) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep the server's command list when the request sent at startup answers after the one sent once the server is running. The console used to drop that answer, so a server too busy to answer the second request left the palette without its commands.

- [`7af30ce`](https://github.com/JSPrismarine/JSPrismarine/commit/7af30ce35dafa86691d8d93b6abf3ce9beed71ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Command for the console's own shortcuts on macOS: `⌘K` opens the command palette, `⌘B` toggles the details pane, `⌘F` cycles the level filter and `⇧⌘R` restarts the server, and the help overlay, the palette and hints spell keys with the macOS symbols. The Control forms keep working, since most macOS terminals keep Command shortcuts for themselves. Copy and paste list `⌘C` and `⌘V` on macOS and `Ctrl+Shift+C` and `Ctrl+Shift+V` elsewhere.

- [`0cfc5e0`](https://github.com/JSPrismarine/JSPrismarine/commit/0cfc5e0c94500813aafcc2b5b730741e52fa4d90) Thanks [@filiphsps](https://github.com/filiphsps)! - The console TUI now wraps long log lines by default (`w` still toggles it) and starts a new row at each newline in a message, indented under the message column. It used to paint the newline inside a single row.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`7424167`](https://github.com/JSPrismarine/JSPrismarine/commit/74241670dcecdd6aea5c45d07290190302d9cd3d) Thanks [@filiphsps](https://github.com/filiphsps)! - Notices are opaque, so the log text under one no longer shows through its spaces and scrambles it. A crash notice under the watcher now says that saving a file restarts the server, and the separate `waiting for changes` notice that followed it is gone.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`c71d3e2`](https://github.com/JSPrismarine/JSPrismarine/commit/c71d3e2f325ec497b4b1f11e63d2bbeddcdeddc2) Thanks [@filiphsps](https://github.com/filiphsps)! - The title bar opens on a solid tile naming the server state: accent while running, warning yellow while starting, stopping or restarting, and signal once it crashed, including while it waits for a change. Without color it is drawn in reverse video. The status bar shows the state only while the title bar is hidden. The side pane draws TPS as a one-row bar graph scaled to the server's tick rate, puts the player count in the Players heading, drops the state row the tile replaces, and shows the dev section only once the server has restarted.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`53e180f`](https://github.com/JSPrismarine/JSPrismarine/commit/53e180fb9cc0aaf2e569ac70c75b7b42fc56d438) Thanks [@filiphsps](https://github.com/filiphsps)! - Closing the terminal the console runs in no longer leaves the server host spinning at full CPU. A failed write to the hung-up terminal surfaced as an uncaught exception whose terminal reset failed the same way, over and over, so the host never reached its own shutdown. The console now stops writing once the terminal is gone, and the host exits.

- [#3273](https://github.com/JSPrismarine/JSPrismarine/pull/3273) [`45364b0`](https://github.com/JSPrismarine/JSPrismarine/commit/45364b08304b6176af353b6fa19583082b0a38fc) Thanks [@filiphsps](https://github.com/filiphsps)! - While a command is typed, a card above the command line shows its description, aliases and the forms it takes, with the argument being typed marked. Once an argument is being typed, it lists only the forms that take it. It also shows for a command typed with a leading `/`. The command palette shows each server command's description.

- [`9b055ab`](https://github.com/JSPrismarine/JSPrismarine/commit/9b055abfc84f05773b6d68588f1dc81d701d34e4) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the console easier to use:
  
  - `?` on an empty command line opens the help overlay, as the placeholder says.
  - Ctrl+C stops the server from the log pane too when nothing is selected, and typing a character there starts a command.
  - PgUp, PgDn, Ctrl+R, Ctrl+L and the restart chord work while the command line has focus.
  - The help overlay shows every shortcut without scrolling at 80×24.
  - The palette and the usage card ask for the command list again once the server runs, so a slow start no longer leaves them empty.
  - While the server starts, the running step shows how long it has taken, the footer names it when the details pane is hidden, and the command line says the server is starting.
  - The activity line says "Starting the server" rather than "Starting generation 1", and the help overlay and palette call the side pane "Server details", as the footer does.

- [#3318](https://github.com/JSPrismarine/JSPrismarine/pull/3318) [`80a87a1`](https://github.com/JSPrismarine/JSPrismarine/commit/80a87a16906f0348d79641927da440d3ee26c62d) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency @opentui/core to v0.9.7

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [`3c7a098`](https://github.com/JSPrismarine/JSPrismarine/commit/3c7a09872272cac3aa07809e0fba3879769708ae) Thanks [@filiphsps](https://github.com/filiphsps)! - The console's usage card now knows how many words each argument takes, so in `tp @s 0 64` it keeps `<position>` marked through all three coordinates instead of moving on to the next argument. Argument types say how many words they read (`argumentWords`): three for a position, two for a Java rotation or two-dimensional position, and the rest of the line for a message, JSON, NBT or a nested command. `CommandManager.commandReference()` sends a count for each part of each form as `usageWords`, and the console protocol's `CommandInfo` carries it.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`81ef0f3`](https://github.com/JSPrismarine/JSPrismarine/commit/81ef0f3acc056a40c0e6dd8a9e7ffe3ecef6c451), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`e9c34cb`](https://github.com/JSPrismarine/JSPrismarine/commit/e9c34cb7afbfe8232eab6c8b3dd506f8e2d135e8), [`51ba202`](https://github.com/JSPrismarine/JSPrismarine/commit/51ba202baff773329d73211062ceed830d253b4f), [`aef478a`](https://github.com/JSPrismarine/JSPrismarine/commit/aef478a92f329bde9046fe616c9e50923f825dfd), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`3c7a098`](https://github.com/JSPrismarine/JSPrismarine/commit/3c7a09872272cac3aa07809e0fba3879769708ae), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/console-protocol@0.23.0
  - @jsprismarine/logger@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`5d63108`](https://github.com/JSPrismarine/JSPrismarine/commit/5d63108845d1a218c3eca2c17ad3eb11224f54ab), [`c54e7dc`](https://github.com/JSPrismarine/JSPrismarine/commit/c54e7dcbff0c97136fbd7dbf3e6481cbeaf634e8)]:
  - @jsprismarine/logger@0.22.0
  - @jsprismarine/console-protocol@0.22.0

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
