# @jsprismarine/script-types

## 0.27.0

### Patch Changes

- [#3816](https://github.com/JSPrismarine/JSPrismarine/pull/3816) [`9dc3e9c`](https://github.com/JSPrismarine/JSPrismarine/commit/9dc3e9c16eddde76bcbd2e269837d6ed4ba66d44) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior pack scripts that import `@jsprismarine/server` get `serverList`. Its `motd`, `levelName`, `onlinePlayers` and `maxPlayers` read what a server list shows now, and `serverList.update(options)` changes them on every transport at once: Bedrock's server list and LAN, the query protocol and Java Edition's multiplayer screen. `serverList.reset()` takes the pack's changes back, and they also go when its scripts stop, as on `/reload`. Where two packs change one property, the one that changed it last shows. A MOTD or second name with a `;` throws a `TypeError`, as does a count that is not a whole number from 0 to 2147483647. `maxPlayers` changes only what the list shows; the server still turns players away at `max-players`. `JsprismarineServerMembers.serverList` and `ScriptServerListMembers` are the embedder's side.

## 0.26.0

No changes in this release.

## 0.25.0

### Patch Changes

- [#3644](https://github.com/JSPrismarine/JSPrismarine/pull/3644) [`bebee44`](https://github.com/JSPrismarine/JSPrismarine/commit/bebee44cff690e812c33487e502c7acef5a33aa7) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/server` has `levels`. `current`, `list()` and `levelOf(player)` describe the server's levels. `transfer`, `create`, `attach` and `detach` move a player to another level and manage levels as `/world` does. Each of the four answers a promise that settles on a script tick after the server finishes.

## 0.24.0

No changes in this release.

## 0.23.2

No changes in this release.

## 0.23.1

No changes in this release.

## 0.23.0

### Patch Changes

- [#3385](https://github.com/JSPrismarine/JSPrismarine/pull/3385) [`266dac7`](https://github.com/JSPrismarine/JSPrismarine/commit/266dac78fdb51c354c47b79baa29d88ec4a6eae7) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/server` has a `config` member: `config.value` is the parsed JSON of the pack's `addons/<name>.config.json`, beside its folder, or `undefined` while there is no file; `config.write(value)` rewrites it; and `config.afterEvents.change` fires on the flush after the file changes on disk. The server reads, writes and watches the file, and a file that fails to parse keeps the last value and is logged once. For code that embeds the script host, `WorldScripts` and `LevelScriptsOptions` take an `addonConfig` store, and the module leaves `config` out without one. `@jsprismarine/script-types` declares the member with its `AddonConfigEvents`, `AddonConfigChangeSignal` and `AddonConfigChangeEvent` types.

- [#3382](https://github.com/JSPrismarine/JSPrismarine/pull/3382) [`dbe6d25`](https://github.com/JSPrismarine/JSPrismarine/commit/dbe6d25712f5edc27062dc9dcf9952cb384f388e) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior pack scripts that import `@jsprismarine/server` get `playerList`. `playerList.setDisplayName(player, name)` changes the name every client, and every later joiner, shows for the player in its player list, and nothing else: chat and the name above the head keep the login name. `playerList.reset(player)` gives the entry its login name back, and every name a pack set reverts when its scripts stop, as on `/reload`. An empty name throws. `PlayerSession.setPlayerListName()` is new, and `playerListEntryOf` takes the name to show.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`fe5bae7`](https://github.com/JSPrismarine/JSPrismarine/commit/fe5bae7595e2b6983823bf9bc9e9c7d977e6bedd) Thanks [@filiphsps](https://github.com/filiphsps)! - A behavior pack script can now read which server it runs on from `@jsprismarine/server`: its `jsprismarine` export holds the server's `name`, `version`, `minecraftVersion` and `protocolVersion`. A pack leaves the module out of its manifest and loads it with `import()` inside `try`, so on Bedrock Dedicated Server the import rejects and the pack falls back. The new `@jsprismarine/script-types` package holds the TypeScript declarations for the module.
  
  An `async` callback passed straight to `system.run` or an event's `subscribe` now runs past its first `await`.

- [`25e9fe9`](https://github.com/JSPrismarine/JSPrismarine/commit/25e9fe9ba738a1ef0f7bb7791457f06f0503be4d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `permissions` to `@jsprismarine/server`: `has`, `groupsOf`, `primaryGroupOf` and `metaOf` read a player's resolved permissions; `grant`, `revoke`, `addToGroup` and `removeFromGroup` write a player's record and `grantToGroup` and `revokeFromGroup` a group's, as `/perms` would; and `afterEvents.permissionsChange` fires after any write to the permission files, from a script, a command or an edit of the file, with a `target` naming the group, or the user by name with their `Player` while online. The server registers the `perms` placeholder namespace with `primary_group`, `groups`, `prefix`, `suffix` and `weight`. `@jsprismarine/script-types` declares the member, its event and its types.

- [`d62581f`](https://github.com/JSPrismarine/JSPrismarine/commit/d62581f59d618e7b6507c5acc2cc64cf40ae64a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior pack scripts have a second JSPrismarine module, `@jsprismarine/placeholders`, loaded like `@jsprismarine/server` with `import()` inside `try`. A pack registers a namespace with `register(namespace, { keys, resolve })`, any pack renders a text with `resolve(text, player?)`, and `namespaces()` lists what is registered. A token is `{namespace:key}`; one nobody provides, or whose resolver gives `undefined` or throws, stays as written, and a resolver that throws reaches the content log once per namespace. A namespace belongs to the pack that registered it and goes when the pack's scripts stop. `jsprismarine.maxPlayers` in `@jsprismarine/server` is the server's `max-players`. `@jsprismarine/script-types` declares both modules, with the `PlaceholderProvider`, `PlaceholderRegistration` and `PlaceholderNamespace` types. For code that embeds the script host, `WorldScripts` exposes the registry as `placeholders`, so the server can register namespaces of its own, and `LevelScriptsOptions` takes `maxPlayers`.

- [`ba69034`](https://github.com/JSPrismarine/JSPrismarine/commit/ba6903429558f03400b8d060bf1f74cbc953788a) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/placeholders` renders templates. `parse(shorthand)` turns `{player:name} &7{player:ping}ms` into a rawtext-style tree, and `render(template, player?)` renders a tree or a shorthand string to text, with the tick an animation in it next changes the text. Besides `text` and `placeholder`, a tree holds `if` nodes with a condition over placeholders and literals, `animate` nodes with frames and an interval in ticks, `gradient` nodes that color each character with the nearest `§` color, and rawtext's `translate`, `score` and `selector`. `@jsprismarine/script-types` declares `Template`, `TemplateNode` and `RenderedTemplate`.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/script-host` and `@jsprismarine/script-types` are published to npm. The script host's install script downloads the QuickJS library built for the machine, on macOS on Apple silicon, Windows on x64, and Linux on x64 and arm64 with glibc or musl, and checks its SHA-256, so scripts run on an installed server without a compiler. `JSP_SCRIPT_HOST_LIBRARY` names a library file to load instead.
  
  `ScriptHostErrors.LibraryNotBuilt` is replaced by `LibraryNotInstalled`, whose message says how to approve the install script for npm, pnpm or Bun. New entries cover a failed or corrupt download, a malformed manifest, and a library that is not the published build.
  
  `@jsprismarine/native-network` exports `PUBLISHED_PLATFORMS`, the platforms it publishes builds for.

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`cf86135`](https://github.com/JSPrismarine/JSPrismarine/commit/cf86135949f6903e026cf9ed9694a0799926a827) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/server` has three members that reach the running server: `performance`, which reads the server's ticks per second, their averages and how long its ticks take each time a script reads it; `getPing(player)`, a player's round trip time in milliseconds; and `bossBars.show(player, options)`, a boss bar on one player's screen that the pack updates and hides, and that goes away when the player leaves or the scripts stop. The embedder gives them through the new `members` option of `WorldScripts`, and a runtime without it leaves them out. `@jsprismarine/script-types` declares them, with the `Player`, `BossBar`, `BossBarOptions` and `BossBarColor` types they take.
