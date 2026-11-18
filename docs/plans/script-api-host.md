# Run Bedrock behavior pack scripts

Started 2026-11-16. This plan is a working document: tick slices off, and add or reshape them as
the work teaches us things. Nothing past slice 2 starts before the plan is approved.

## Goal

Unmodified Bedrock add-ons whose behavior packs carry `@minecraft/server` scripts run on
JSPrismarine and behave as they do on the pinned Bedrock Dedicated Server (BDS). Script packs
become JSPrismarine's primary plugin format.

The decisions that carry it:

- Each level, which is one Bedrock world with all its dimensions, runs its packs' scripts in one
  embedded QuickJS runtime on the thread its worlds tick on.
  Before-events are guards and after-events flush at the end of the tick
  ([ADR 0020](../adr/0020-scripts-run-in-quickjs-on-the-world-thread.md),
  [ADR 0015](../adr/0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)).
- The watchdog counts steps, not milliseconds, and scripts are part of replay
  ([ADR 0021](../adr/0021-the-script-watchdog-counts-steps.md)).
- The API's shape is generated from `bedrock-samples` metadata, and only behavior is written by
  hand ([ADR 0022](../adr/0022-the-script-api-surface-is-generated.md)).
- Bellard's QuickJS is bound through one C layer of our own, over `node:ffi` and scriptc's FFI
  ([ADR 0023](../adr/0023-quickjs-through-one-c-layer-and-ffi.md)).

What done looks like:

- A pack copied from a BDS server, with its `config/` folder, loads on JSP without edits.
- A pack gets the newest stable minor of the `@minecraft/server` major version it declares, as on
  BDS.
- The `scripting.*` parity families run each scenario's pack on BDS and on JSP and finds the same
  events, return values, errors and world changes.
- The packs in the add-on corpus run, milestone by milestone.
- A pack can use JSP-only features through an undeclared `import('@jsprismarine/server')` and
  still load on BDS, where the import rejects.
- Dynamic properties and scoreboards survive a world moved between BDS and JSP in both
  directions.
- `/reload` and the Minecraft Bedrock Debugger for VS Code work as they do on BDS.

Out of scope for now:

- `@minecraft/server-editor` and the editor experience.
- Scripts in resource packs. The server has nothing to run for them.
- Marketplace and other closed packs as test fixtures.

## What we know

The facts and their sources are in [bedrock-script-api.md](../research/bedrock-script-api.md).
Section 6 of [bedrock-addons-and-custom-content.md](../research/bedrock-addons-and-custom-content.md)
covers the Script API's place among add-on features. The ones the plan rests on:

- BDS embeds an older QuickJS from Bellard's line: no `Intl`, no iterator helpers, no
  `Float16Array`, no `eval` and no `new Function` from a string.
- BDS refuses to load a pack that declares a module it does not know, even with
  `"optional": true`. An undeclared `import()` of an unknown module loads the pack and rejects the
  promise. That is the detection mechanism for `@jsprismarine/server`.
- BDS serves the newest stable minor of each major version: a pack declaring 2.0.0 sees 2.10.0.
- AddonBridge, a PowerNukkitX plugin with no license, runs part of the API in GraalJS. Endstone's
  Node.js plugin swaps the engine inside BDS. No other third-party server runs these scripts.
- After-events, system tasks and promise jobs flush at the end of the tick, in a loop Microsoft
  documents. Before-events and custom command callbacks run under restricted execution.
- Version 1 and version 2 scripts start differently: early execution and `startup` for version 2,
  `worldInitialize` for version 1, and `worldLoad` for both after the first tick.
- Dynamic properties are one little-endian NBT compound under the LevelDB key
  `DynamicProperties`, with a child compound per pack header UUID.
- BDS's watchdog runs on the wall clock, and a caught stack overflow still shuts the server down by
  default.
- A C layer over quickjs-ng, bound with `node:ffi`, called back into TypeScript synchronously on
  the main thread and in a worker, and its step budget stopped a loop at the same step every run.
- Eight of the 14 corpus candidates depend on a beta `@minecraft/server`.

## Shape

`@jsprismarine/script-host` (`packages/script-host`) owns the runtime. `@jsprismarine/prismarine`
depends on it, never the other way. Inside the package:

- **The native layer.** Bellard's QuickJS at a pinned version, the debugger patch, and our C
  layer, built per platform as
  [ADR 0023](../adr/0023-quickjs-through-one-c-layer-and-ffi.md) describes.
- **The engine binding.** One TypeScript wrapper per runtime over the C layer: handles, the host
  dispatch, the step budget and the allocation limit.
- **The generated shape.** Modules, versions, classes, members, validation, enums, errors and
  privileges, generated from `metadata/script_modules` by a script in the package.
- **The pack loader.** It reads `type: "script"` modules from the world's behavior packs, resolves
  their native module dependencies and versions, applies `permissions.json`, and starts each
  pack's entry under the right lifecycle.
- **The world seam.** A narrow interface that `prismarine` implements for each level: reads by id,
  writes through setters, guard registration for before-events, the change log for after-events,
  and the inputs that carry `Date` and `server-net` responses. The host never imports the world's
  classes.
- **The JSP module.** `@jsprismarine/server`, the in-script module. Its typings are published to
  npm as a package of declarations only, generated from the same definitions as the runtime.

## How we measure

Every measure is a count or an outcome, never a duration.

- **Parity.** Scenario rows in the `scripting.*` families pass or fail.
- **Coverage.** Implemented members over members, for each module and version, and the same
  weighted by how often the corpus uses each member. Both are reported with `reportProgress` and
  never gate CI.
- **Corpus.** The corpus packs that load, and the ones whose smoke scenario passes.
- **Cost.** Host calls, bytes copied across the C layer and steps, per callback and per tick, in
  unit tests with bounds such as "one host call per `getBlock`".

## The parity family

The families join `packages/parity/src/families.ts` as `scripting.<domain>`, starting with
`scripting.lifecycle`, `scripting.events` and `scripting.engine`, because a family id needs a group
and a domain. A scenario is a small behavior pack with a
script that records what it observes, and a test that compares the record. The BDS side runs
through the staging that `bedrock-dump` already uses to run its own script pack, and writes the
record as a golden. CI compares JSP's record against the checked-in golden, and a refresh reruns
BDS, as the other captures do ([ADR 0019](../adr/0019-bedrock-data-comes-from-bds.md)). A gap
left open goes into `goldens/behavior-gaps.json` with its issue.

## The add-on corpus

The repository never holds a copy of an add-on. A manifest in the package lists open-source
add-ons with licenses that allow use, each as a repository URL and a full commit hash. Tests and
the counter fetch each pack at its pinned commit into the cache on demand, as the BDS pins are
fetched, and reuse the cached copy after that. The fetch checks out the exact commit, so an
upstream force-push or a deleted branch cannot change what a test runs; a commit that is gone
fails the fetch and names the pack. Only the manifest and the usage counts are checked in. A counter reads each
pack's scripts and records which modules, classes, members and events it uses. The counts set the
order of the breadth slices, and each breadth slice names the corpus packs it makes run.

## Slices

1. [x] **Grill and decide.** ADRs 0020 to 0023 and the ADR 0015 amendment.
2. [x] **Research note.** [bedrock-script-api.md](../research/bedrock-script-api.md): versions
   and their members, timing, configuration, storage, the debugger protocol, engine options, and
   corpus candidates.
3. [x] [#3200](https://github.com/JSPrismarine/JSPrismarine/issues/3200) **The engine on one platform.** Linux x64 first.
   - Create `packages/script-host` with its README.
   - Build Bellard's QuickJS at its latest release and the C layer: handles, host dispatch, the
     interrupt-driven step budget, the allocation and stack limits, state per engine.
   - Remove the globals BDS lacks and disable `eval` and `Function` from a string, with a
     `scripting.engine` row comparing `globalThis` with BDS's.
   - Bind it with `node:ffi`, as the native networking package does.
   - Tests: evaluation, a host call from inside a script, a `while (true)` stopped at the same
     step on every run, an allocation limit, two engines on two threads.
4. [x] [#3201](https://github.com/JSPrismarine/JSPrismarine/issues/3201) **The generated shape.** The generator over `metadata/script_modules`, the semver
   resolution, and `NotImplementedError` stubs for every member.
   - The overrides list for metadata gaps, starting with `registerCommand`'s privilege.
   - Tests: a pack declaring 1.3.0 gets the newest 1.x, argument validation errors match the
     metadata, an unimplemented call names its member.
   - Learned: the research note records only two of BDS's argument errors, the variant
     conversion failure and `ArgumentOutOfBoundsError`'s text. The wrong-type, argument count and
     no-constructor messages follow BDS's wording unconfirmed, and want a `scripting.engine` row
     that calls members with bad arguments on BDS. Every `valid_range` in the pinned metadata is
     the int32 range, whatever the type, so only `details` bounds an argument.
5. [x] [#3202](https://github.com/JSPrismarine/JSPrismarine/issues/3202) **The parity families.** Declare the `scripting.*` families, write the BDS runner and the
   golden format, and land one scenario that runs on BDS, with JSP's row recorded as a gap.
6. [x] [#3203](https://github.com/JSPrismarine/JSPrismarine/issues/3203) **The skeleton.** The milestone that proves every mechanism once:
   - manifest and native module resolution, including an undeclared `@jsprismarine/server` import
     that rejects on BDS and resolves on JSP
   - `permissions.json`, `variables.json` and `secrets.json` from the BDS layout
   - version 1 and version 2 lifecycles, with the `startup`, `worldInitialize` and `worldLoad`
     order
   - `system.run`, `runTimeout` and `runInterval`, and the script flush phase's order
   - one before-event (`chatSend` cancelled) and one after-event
   - `world.sendMessage`
   - termination when the step budget runs out, a caught stack overflow, and `watchdogTerminate`
   - `/reload`, and `pnpm run dev` calling it when a script changes
   - seeded `Math.random`, `Date` as an input, and a replay of a scripted session reaching the
     same digest
   - one QuickJS context per pack in the world's runtime, since BDS creates a context for each
     pack ("failed to create context" names one pack), so packs never share a `globalThis`
   - privileges enforced from the generated shape: early execution and restricted execution
     throw with BDS's messages, and the load-time scan prints each pack's coverage
   - a `scripting.engine` row that confirms the argument error messages slice 4 wrote in BDS's
     style without a capture: wrong type, wrong count, and a class with no constructor
   - Done when every item has a passing `scripting` row.
   - Learned: `world.beforeEvents.chatSend` and `system.beforeEvents.watchdogTerminate` are beta
     only in the pinned `@minecraft/server` 2.10.0, and a capture has no client to chat, so the
     stable before-event is `weatherChange`, which `Dimension.setWeather` raises with no player.
     `watchdogTerminate` waits for slice 9; until then `script-watchdog-enable-shutdown` alone
     decides. `variables.json` and `secrets.json` are read, but only the beta
     `@minecraft/server-admin` exposes them, so no stable row covers them.
   - Learned: a script's `runCommand('reload')` succeeds 0 times on BDS, so the `reload`
     scenario sends `/reload` on the console and stamps ticks relative to each run.
   - Learned: a module's `config/<uuid>/permissions.json` replaces the default's list, and BDS
     resolves an undeclared `import()` of any module, `@minecraft/server-gametest` included, with
     the same `ReferenceError`.
   - Learned: a `system.run` that a running task queues waits for the next tick, while a
     `runTimeout` of 0 queued the same way runs in the same pass, and run ids count from 1 across
     the whole runtime.
   - Learned: a Bedrock world is a JSPrismarine level, so the runtime belongs to the default
     level and flushes in its default world's tick, before that world's change log seals. The
     version 2 packs' early execution runs once the worlds have loaded, just before the version 1
     packs, since no script can observe the world in early execution.
   - Left: `/reload` reloads scripts but not function files
     ([#3225](https://github.com/JSPrismarine/JSPrismarine/issues/3225)); the replay trace does not
     record the admitted clock yet ([#3226](https://github.com/JSPrismarine/JSPrismarine/issues/3226));
     the `script-world-message` client-e2e scenario has not run anywhere
     ([#3227](https://github.com/JSPrismarine/JSPrismarine/issues/3227)); the milliseconds-to-steps
     ratio is a placeholder ([#3228](https://github.com/JSPrismarine/JSPrismarine/issues/3228));
     `chatSend` and `watchdogTerminate` move to slice 9; `@minecraft/server`'s weather and
     `world.sendMessage` are the only world members with behavior; the script host is an optional
     dependency of `prismarine` while it is private and built for Linux x64 only
     ([#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215)).
7. [ ] [#3204](https://github.com/JSPrismarine/JSPrismarine/issues/3204) **The debugger.** The protocol the VS Code extension speaks, `/script debugger
   listen|connect|detach` and the `script-debugger-*` properties, over koush's debugger patch
   ported to the pinned QuickJS. Planned with the skeleton, and split into its own slice right
   after it if the port is large.
   - Done when VS Code attaches and stops at a breakpoint in a scenario pack.
   - Learned: the port is a second patch, `quickjs-debugger.patch`, which adds 437 lines to
     `quickjs.c` and `quickjs.h` and changes 5; koush's diff added 465. His 743-line
     `quickjs-debugger.c` became `jsh_debug_*` in the C layer, about 420 lines, and the protocol
     moved to TypeScript in `src/debugger/`. The existing step tests keep their counts. The pinned
     QuickJS gives a frame slot only to variables a closure captures, so an evaluation borrows the
     slot of any other variable and leaves a closure it makes with a copy.
   - The world host (2026-11-17): the `script-debugger-*` and `*-script-debugging` properties in
     `config.json`, `/script debugger listen|connect|close` with `detach` as an alias of `close`,
     auto-attach before the scripts start, `DebuggerThread` for the sockets, a handshake that
     waits between ticks for the extension's answer, the attach to the pack `targetModuleUUID`
     picks, a `poll` after each message, and no socket at all when the server is a replay.
   - Learned, from the pinned BDS 1.26.51.1's console, wire and `en_US.lang`: the commands print
     `Debugger listening on port %s`, `Debugger connected to host %s on port %s` once the
     handshake passes, and `Debugger closed`, the last even with nothing open. A failed connect or
     a refused listener prints `Failed to start debugger`, and the properties' refusals
     `Inbound connections are disabled` and `Outbound connections are disabled`. With
     `force-inbound-debug-port` set, `/help` lists `/script debugger listen` with no port and a
     port is a syntax error. BDS has no `detach`. Listening on 0 printed port 0, and 70000 printed
     4464.
   - Learned: an attach logs `[Scripting] Debugger attached to [<ip>] on port [<port>].` as a
     warning and sends it as a `PrintEvent` of level 2. A refused handshake logs BDS's line as an
     error, sends it as a level 3 `PrintEvent` and closes, and in connect mode BDS then connects
     once more. The extension leaving logs `[Scripting] Debugger connection closed.` BDS blocks
     its server on the handshake: a connection that never answers stopped its ticks and its
     console. JSPrismarine offers the protocol and answers once the reply is there instead.
   - Learned: auto-attach logs `Debugger auto-attach waiting for [<n>] seconds.` first, so the
     timeout is in seconds, then `did not connect.`, `did not connect, but is still listening.`
     or a `failed,` line for disabled connections or a bad address. Connect mode tried for the
     whole timeout. An invalid connect address also logs BDS's `Invalid script debugger connect
     address` line.
   - Learned: BDS offers protocol 10, writes `require_passcode: false` out, lists every pack with
     a script module as a plugin, and names files from the pack's `scripts/` folder: a breakpoint
     on `main.js` verified and one on `scripts/main.js` did not. It streams `StatEvent2` every
     tick, sends a `SchemaEvent` after attaching, forwards the content log as `PrintEvent`s,
     sends `ThreadEvent` exited and new around `/reload`, and sends a `terminated` event before
     `close` drops the connection. BDS's listener reset every connection on this host, so its
     listen-mode handshake was not captured.
   - Left: `/reload` ends the debugger session instead of keeping it across the new engine as BDS
     does; the extension's command box (`minecraftCommand`), the `terminated` event, the stats
     and schema events and the profiler are not implemented; the VS Code check below has not run,
     because VS Code is not available on the host that built this.
   - Checking it with VS Code: install the Minecraft Bedrock Debugger extension
     (`mojang-studios.minecraft-debugger`) and run
     `pnpm --filter @jsprismarine/script-host run build:native`. Give the server a flat world,
     `"content-world-packs": ["<checkout>/packages/parity/scenarios/system-tasks/tasks"]`,
     `"allow-inbound-script-debugging": true`, `"force-inbound-debug-port": 19144`,
     `"script-debugger-auto-attach": "listen"` and `"script-debugger-auto-attach-timeout": 120`
     in `config.json`, and start it with `pnpm dev`. It logs that auto-attach is waiting. Open the
     pack's folder in VS Code, set a breakpoint on `record('run A');` in `scripts/main.js`, and
     start an `attach` configuration of type `minecraft-js` with `"mode": "connect"`,
     `"localRoot": "${workspaceFolder}/scripts/"`, `"port": 19144` and
     `"targetModuleUuid": "13f251b3-41c9-4271-b2d1-d4abde28890b"`. The server logs `Debugger
     attached`, starts the scripts, and the first tick stops at the breakpoint with `main.js` on
     top of the call stack, and the server does not tick while it is stopped. Inspect a variable, continue, and
     run `script debugger close` on the console: VS Code's session ends and the server prints
     `Debugger closed`. For the other direction, set `"mode": "listen"` and run
     `script debugger connect localhost 19144` with `allow-outbound-script-debugging` on.
8. [x] [#3205](https://github.com/JSPrismarine/JSPrismarine/issues/3205) **The corpus.** The manifest, the fetch script and the usage counter, starting from the
   candidates in the research note. Count beta packs too. Order slices 9 onward by the counts.
   - Learned (2026-11-17): the corpus is 19 packs from 13 repositories, 11 of them stable on
     `@minecraft/server` and 8 beta. Mojang's three editor samples, its project template, a
     ChestLockAddon pack on `2.0.0-alpha` and Protection-Area-Addon, whose entry script is missing
     at its commit, stay out with the research note's three exclusions. The research note's samples
     commit `73a171fc8b` names no commit; the pin is the head, `73a171fc83`.
   - Learned: `system.run`, `runTimeout` and `runInterval`, the players and dimensions of `world`,
     `getComponent` with the inventory's container, `new ItemStack`, `scriptEventReceive` and
     `startup` lead both rankings. Custom commands (`CustomCommandParamType`,
     `CommandPermissionLevel`) appear in 6 of the 8 beta packs, world dynamic properties in 7 of
     them, and `@minecraft/server-ui` forms in 11 packs in all. `WorldBeforeEvents.chatSend` and
     `playerPlaceBlock` are beta-only and used by 5 beta packs each, which supports doing slice 9
     first. `packages/script-host/corpus/ranking.md` has the full ranking.
9. [x] [#3206](https://github.com/JSPrismarine/JSPrismarine/issues/3206) **Beta modules.** Right after the skeleton, because 8 of the 19 corpus packs depend on a
   beta `@minecraft/server`, and members 5 of them use, such as `WorldBeforeEvents.chatSend`, exist
   only in beta.
   - The Beta APIs experiment as a world setting, sent to clients and required by a pack that
     declares a `-beta` version, with BDS's message when it is off.
   - The generated shape of each beta version the pinned BDS ships. Beta versions do not follow
     semver, so a `scripting.lifecycle` row records what BDS does with a pack that names another
     beta version.
   - From here on, breadth slices implement a member in the stable and beta shapes together.
   - Learned (2026-11-17): BDS serves exactly one beta per module, the one it ships, and refuses
     every other beta, older or newer, with `requested invalid version`, a `Current [beta]
     version` line and the versions it ships. The word `beta` names the shipped one. A stable
     version it does not ship, such as 2.11.0, gets the same message, not the unknown-module one.
     Canopy and Construct (2.12.0-beta), Understudy (2.9.0-beta), UnRealm (2.7.0-beta),
     XBlockFire (2.8.0-beta), the beta samples (2.2.0-beta) and ChestLockAddon (1.17.0-beta) do
     not load on the pinned BDS; only LushWay's 2.11.0-beta does. The `beta-versions` and
     `beta-experiment-off` rows record it, and goldens now keep BDS's plugin errors as
     `refusals`.
   - Learned: the Beta APIs experiment is `experiments.gametest` in `level.dat`, and BDS accepts a
     staged `level.dat` that holds only the experiments and `Generator`. Without it, a beta of any
     module gets the Beta APIs message, which BDS checks before the version. `3.0.0-alpha` loads
     without the experiment and has no metadata, so JSPrismarine refuses it.
   - Learned: a GameTest simulated player's `chat` raises `chatSend` on BDS, so a capture can chat
     without a client: the `chat-send` scenario runs `/gametest run` and ships a 3 by 3 by 3
     structure of air, which BDS loads even with a structure location. JSPrismarine's row waits
     for `@minecraft/server-gametest` ([#3211](https://github.com/JSPrismarine/JSPrismarine/issues/3211)).
   - Learned: a canceled `watchdogTerminate` leaves only the `hang detected` or `Stack overflow
     detected` line; the unhandled-exception and shutdown lines do not follow. The event for a
     caught stack overflow comes after the script's `catch` ran.
   - Left: where BDS logs the unhandled exception when no script cancels `watchdogTerminate`, and
     whether the event fires with `script-watchdog-enable-shutdown` off, are not captured; the
     runtime sends it only before a shutdown and logs the unhandled exception after it.
     `ChatSendBeforeEvent.targets` and `Player.name` have no behavior yet.
10. [ ] [#3207](https://github.com/JSPrismarine/JSPrismarine/issues/3207) **Core server breadth.** Players, entities, blocks, dimensions, items and the events the
    corpus uses most, in batches. Each batch names the corpus packs it makes run.
    - Batch 1 (2026-11-17): `world.getPlayers` and `getAllPlayers`, `Dimension.getEntities`,
      `spawnEntity`, `getBlock` and `runCommand`, `Entity` and `Player` with the inventory's
      `Container`, `Block`, `BlockPermutation`, `ItemStack`, the player join, spawn and leave
      events, `world.beforeEvents.playerLeave` and `system.afterEvents.scriptEventReceive`. The
      corpus's share of member uses with behavior went from 19.8% to 60.4%. The `scripting.world`,
      `entities`, `blocks` and `items` families hold the scenarios; `items` matches BDS.
    - Learned: with no player, BDS loads no chunk, so a scenario that reads blocks adds a ticking
      area and counts ticks from the tick the chunk at the origin loads. A GameTest simulated
      player raises `playerJoin` and `playerSpawn` in the same tick, after the test's own code.
    - Learned: BDS returns a new `Block` for every `getBlock` and the same `Entity` and `Dimension`
      objects every time, and a killed entity's `id` and `typeId` still answer while its other
      members throw `InvalidEntityError`. A value set on a property outside its bounds throws
      `PropertyOutOfBoundsError`, not the argument error, and `ItemStack.amount` set past the
      stack size holds a full stack while the constructor takes up to 255.
    - Learned: the server scenarios run on JSPrismarine in a headless server with a flat world,
      so their rows exercise the command verbs and setters scripts write through.
    - Left: command errors keep Brigadier's wording rather than BDS's `Syntax error`; only a
      player has an inventory a script reaches; JSPrismarine's palette lacks `old_log_type` and
      `stone_type`; `/scriptevent` works only from a script; world dynamic properties wait for
      slice 12; the `players` row waits for `@minecraft/server-gametest`
      ([#3211](https://github.com/JSPrismarine/JSPrismarine/issues/3211)); the
      `script-teleport` client-e2e scenario has not passed locally, where the client stayed on
      the loading screen of a server skipping ticks.
    - Batch 2 (2026-11-18): `World.getEntity`, `Dimension.getPlayers`, `Entity.getRotation`,
      `getHeadLocation`, `getViewDirection`, `isSneaking` and `applyDamage`, `Player.getGameMode`
      and `selectedSlotIndex`, `Container.addItem`, an inventory for any entity whose
      `minecraft:inventory` declares a container, `world.afterEvents.entitySpawn`, `entityHurt`
      and `entityDie`, and `/scriptevent` from the console and from a player. The corpus's share
      of member uses with behavior went from 68.6% to 74.2%. The `entities` scenario now matches
      BDS, chest minecart included, and the new `entity-members`, `players`, `entity-events` and
      `script-event-console` scenarios hold the rest; `entity-members` and `players` match.
    - Learned: `Container.addItem` tops up matching stacks in slot order, then fills empty slots in
      slot order, leaves its argument alone and returns what did not fit. `applyDamage` inside the
      grace period of a stronger blow returns true and raises nothing, and a stronger one deals
      the difference (97 after 3). BDS sends a flush's entity events as every spawn, then every
      blow, then every death; `kill()` on a pig is a `selfDestruct` blow of its whole health, and
      on an armor stand raises neither. A dying mob stays valid through its death animation. A
      gone entity's `nameTag` read throws the "set property" error, and the
      `selectedSlotIndex` bounds error names the property `selectedSlot`.
    - Left: a dying mob leaves JSPrismarine's script world at once, an armor stand's `kill()`
      raises hurt and die events, and the console trims the end of a `/scriptevent` message
      (`scripting.events` and `scripting.world` gaps). The entity events ignore
      `EntityEventOptions`. Next by corpus use: `Player.onScreenDisplay`, `MolangVariableMap`,
      `world.beforeEvents.playerBreakBlock` and `itemUse`, `Player.playSound`, `System.runJob`,
      `Entity.addEffect`, `ItemStack.getComponent` and block inventories.
    - Batch 3 (2026-11-18): `system.runJob` and `clearJob`, `Player.onScreenDisplay` with
      `setTitle`, `updateSubtitle` and `setActionBar`, `Player.playSound` and `Dimension.playSound`
      with their `SoundInstance`, `MolangVariableMap` with `Dimension.spawnParticle`,
      `Entity.addEffect`, `getEffect`, `getEffects` and `removeEffect` with `Effect`, the
      `isSneaking` setter, a block's inventory component and its container, an item stack's
      durability component, `world.beforeEvents` and `afterEvents` for `itemUse` and
      `playerBreakBlock`, and `EntityEventOptions` on `entityHurt` and `entityDie`. The corpus's
      share of member uses with behavior went from 74.2% to 82.2%, and its share of pack members
      from 52.1% to 62.8%. The new `system-jobs`, `entity-event-options` and `player-feedback`
      scenarios match BDS, and `block-inventory` and `entity-effects` match but for the gaps below.
    - Learned: BDS runs a job from the tick after `runJob`, before that tick's system tasks. Each
      tick, every job takes one step in the order they were queued, then each job runs to its end
      in the same order, so a job of 2,000 steps ended in one tick. JSPrismarine gives a tick's
      jobs 100 interpreter steps where BDS gives them what is left of the tick's time.
    - Learned: a subscriber with `EntityEventOptions` gets an entity's event only when each list it
      gives names the entity or its type. An empty list matches no entity, and BDS adds no
      namespace to a type, so `cow` matches nothing.
    - Learned: `addEffect` returns the effect the entity has afterwards, so a weaker effect returns
      the one already there. `displayName` writes the potency in Roman numerals from II up, as in
      `Speed IV`. A removed player's `ScreenDisplay` throws `Failed to call function 'Player'`.
      `playSound` returns a `SoundInstance` whose `id` counts up from 1.
    - Learned: a simulated player's `breakBlock` breaks the block in the next tick, and a break
      the before-event cancels tries again the tick after. Its first `useItem` raises both
      `itemUse` events in the same tick, and later calls return false and raise neither, even
      after `stopUsingItem`, so the scenario uses one item and a unit test covers the canceled use.
    - Left: a mob's effects do not count down in a world with no player, because JSPrismarine has
      no `/tickingarea` ([#3251](https://github.com/JSPrismarine/JSPrismarine/issues/3251)), and
      a dying pig's `getEffects` throws, as batch 2's dying mob does. On BDS, a stack read back
      from a chest throws `Failed to get property 'damage'.` from its durability component, where
      JSPrismarine returns the damage. `ScreenDisplay`'s HUD members, `SoundInstance.stop`,
      `Effect.isValid`, `EffectTypes`, `Player.spawnParticle`, item components other than
      durability and `world.afterEvents.playerInventoryItemChange` have no behavior yet. Next by corpus use:
      `World.structureManager` and `StructureManager`, `EntityEquippableComponent`,
      `EntityAttributeComponent`, `DimensionTypes`, `Container.getSlot` and `ContainerSlot`,
      `world.beforeEvents.playerInteractWithBlock` and `Entity.getBlockFromViewDirection`.
11. [x] [#3208](https://github.com/JSPrismarine/JSPrismarine/issues/3208) **Custom components.** `registerCustomComponent` for blocks and items registers into the
    behavior registry of the [data-driven plan](data-driven-vanilla.md), through an adapter from
    the 15 block hooks and 7 item hooks. Custom commands register into the command tree.
    - Done (2026-11-17): the registries of `startup` and version 1's `worldInitialize` with BDS's
      errors; custom commands in the server's command tree with every `CustomCommandParamType`,
      their permission level, `cheatsRequired`, an alias without the namespace and their enums in
      `AvailableCommandsPacket`; the callback in restricted execution, its result message to the
      sender and its failure as 0 successes. The `jsprismarine:script_components` behavior
      attaches to every block and item whose pack JSON names a custom component, as a version 2
      key or in `minecraft:custom_components`, and forwards `onPlayerBreak`, `onPlayerInteract`,
      `beforeOnPlayerPlace`, `onTick`, `onRandomTick`, `onUse`, `onUseOn`, `onConsume` and
      `onMineBlock`. `onPlace` and `onBreak` come from `World.onBlockWritten`, since a command's
      or a script's write runs no behavior hook. `beforeOnPlayerPlace` is a new `BlockHooks` hook,
      a guard of the player's placement. A block with `minecraft:tick` schedules its ticks when it
      is placed. A block a world pack defines now gets a state schema when the content builds, so
      its states have runtime ids and a command or script can place it. The `scripting.commands`
      and `scripting.components` families hold the scenarios, and `script-custom-command` is the
      client-e2e scenario.
    - Learned, from the pinned BDS 1.26.51.1: a name without a namespace or in `minecraft` throws
      `NamespaceNameError` (`string must be prefixed with a namespace (eg. namespace:value).`,
      `string has invalid namespace (minecraft).`); a second registration throws
      `CustomCommandError` (`Custom Command 'jsp:hello' was already registered.`, `Custom Command
      Enum ...`) or `BlockCustomComponentAlreadyRegisteredError`; a missing enum throws `Custom
      Command depends on one or more unknown enums [jsp:nothing].`; a registration after
      `startup` throws `Custom Command registration failed outside of the ModuleStartup event.` or
      `CustomComponentInvalidRegistryError: Cannot register custom component outside of the
      ModuleStartup event.`, not the privilege error. A command name with an upper-case letter
      registers without an error, then BDS logs two `[Commands] Register Command` lines and drops
      it. BDS also answers a custom command without its namespace.
    - Learned: a callback gets `String`, `Integer`, `Float` and `Boolean` as plain values, a
      `Location` as a `Vector3` whose whole absolute x and z name the middle of the block, a
      selector as an array of entities (empty when nothing matches, with no error), and a type as
      its `EntityType`, `ItemType` or `BlockType`. An `Enum` parameter takes a word the enum does
      not list. From a script's `runCommand` the origin is `Server`; a `Failure` result or a
      callback that throws gives 0 successes and no error, and so does a command above the game
      directors' level. On the console a success message prints as information and a failure
      message, or a thrown error's message, as an error.
    - Learned: `onPlace`, `onTick` and `onBreak` run after the script that placed or removed the
      block, in the same tick, and `/setblock` and `Block.setType` raise them. A block with
      `minecraft:tick` interval 10 ticks 10 and 20 ticks after it was placed. A block named in
      `minecraft:custom_components` gets `onPlace` but no `onBreak`, and its component's
      parameters are `undefined`. A block whose version 2 component no script registered fails to
      parse, so the block does not exist; JSPrismarine resolves the content before any script
      runs and loads it.
    - Left: no engine event raises `onStepOn`, `onStepOff`, `onEntityFallOn`, `onEntity`,
      `onRedstoneUpdate`, `onBlockStateChange`, `onHitEntity`, `onCompleteUse` or
      `onBeforeDurabilityDamage` for a script's component yet; a component a permutation names
      runs for every state of the block; an item hook's block is read in the overworld; command
      parse errors keep Brigadier's wording; `cheatsRequired` is recorded but JSPrismarine has no
      cheats setting; BDS's `ParameterLimit` is not checked; `/setblock` of the block already
      standing there counts one success where BDS counts none; the item and player hooks need a
      GameTest simulated player for a BDS row ([#3211](https://github.com/JSPrismarine/JSPrismarine/issues/3211)).
12. [x] [#3209](https://github.com/JSPrismarine/JSPrismarine/issues/3209) **Persistence.** Dynamic properties and script scoreboards, byte-compatible with BDS and
    checked by the LevelDB compatibility suite in both directions.
    - Done (2026-11-17): the dynamic property members of `World`, `Entity` and `ItemStack`, with
      `setDynamicProperties`; `world.scoreboard` with every member of `Scoreboard`,
      `ScoreboardObjective`, `ScoreboardIdentity` and `ScoreboardScoreInfo`, and
      `Entity.scoreboardIdentity`. The level keeps the world's properties and the scoreboard,
      `/scoreboard` uses the same store, and the save pass writes both as BDS does. The
      `persistence` scenario of `scripting.world` holds the values and errors, and
      `persistenceCompat.test.ts` moves a world from BDS to JSPrismarine and back.
    - Learned, from the pinned BDS 1.26.51.1's LevelDB: an entity keeps its properties in its actor
      record's `DynamicProperties` compound, by pack header UUID, in the same form as the world's
      record. An item keeps them in its `tag.DynamicProperties`, by the script module UUID, not
      the header UUID. Only an item that does not stack holds them, even a stack of one apple
      throws `UnsupportedFunctionalityError`.
    - Learned: the `scoreboard` record is one compound of `Criteria` (empty), `DisplayObjectives`
      (`Name`, `ObjectiveName`, `SortOrder` byte, 1 descending), `Entries` (`IdentityType` 1
      player, 2 entity, 3 fake player, `ScoreboardId`, and `PlayerId`, `EntityID` or
      `FakePlayerName`), `LastUniqueID`, and `Objectives` (`Criteria`, `DisplayName`, `Name`,
      `Scores` of `Score` and `ScoreboardId`). BDS writes each list newest first and the slots in
      byte order. `setObjectiveAtDisplaySlot` and `/scoreboard objectives setdisplay` both default
      to descending.
    - Learned: `getDynamicPropertyTotalByteCount` is, per property, the id's UTF-8 bytes plus one
      plus 8 for a number, 1 for a boolean, 12 for a vector or a string's UTF-8 bytes plus one;
      this explains the 8 bytes the research note left open. The 32767 limit counts UTF-8 bytes.
      A vector part past the float range is stored as infinity, the set succeeds, and the get
      throws `Infinity value is not supported.` `NaN`, `Infinity`, a bigint, an array and an
      object without `x`, `y` and `z` throw `Native variant type conversion failed.` with no
      argument named, `null` deletes, and a bad value in `setDynamicProperties` writes none.
    - Learned: a scoreboard participant gets its id the first time it scores, from one counter;
      an entity's `displayName` is its id. `getScore` of a name the board has never scored throws
      `Failed to resolve identity`, and a removed objective's members throw `Failed to find
      objective`.
    - Left: a command's holder is still a name, so `/scoreboard` scores a player or a selected
      entity as a fake player of that name, while a script scores its identity; a player's own
      dynamic properties and player identities are not saved, since the player record keeps no
      unmodeled tags; an item stack's properties stay on the script's stack and are dropped when
      it goes into an inventory; clients are not sent a script's scoreboard changes;
      `/scoreboard objectives setdisplay` defaults to ascending, as Java does, where BDS
      defaults to descending; and the level's properties and scores are written through the
      level's setters but, like the weather, reach no change log, which has no level-wide entry
      yet.
    - Learned: JSPrismarine neither saves nor loads an actor's `CustomName`, so a name tag a
      script sets is gone after a restart, and an entity from a BDS world loads without its name.
      The compatibility pack finds its armor stand by a tag instead.
13. [x] [#3210](https://github.com/JSPrismarine/JSPrismarine/issues/3210) **`@minecraft/server-ui`.** Forms, over the modal form packets.
    - Learned (2026-11-17): a GameTest simulated player has no client, so the form captures join a
      headless `@jsprismarine/client` to BDS. A scenario's `client` lists its answers, and the
      `scripting.ui` goldens keep the form JSON the client received. The four scenarios, `forms`,
      `form-json`, `form-responses` and `forms-v1`, match on JSPrismarine.
    - Learned: BDS writes form JSON with jsoncpp's old writer: keys in byte order, a newline at the
      end, only `"`, `\` and control characters escaped (`\u001F` in upper case), and floats as
      `%#.16g` with the trailing zeros cut to one, so 0.5 is `0.50`. Slider bounds and steps are
      32-bit floats and defaults integers, even a version 1 slider's float default. An empty
      element list is `null`. Version 1 `MessageFormData` swaps `button1` and `button2` in the
      JSON and reads `true` as 1; version 2 reads `true` as 0.
    - Learned: BDS checks a response's JSON type, not its range: an action form takes any integer,
      as a 32-bit unsigned number, or a boolean; a modal form takes a flat list of any length.
      A cancel reason wins over JSON, a response with neither stays open, and text that is not
      JSON disconnects the client. A player who leaves rejects their forms with `PlayerQuit`,
      newest first, and `closeAllForms` sends `ClientboundCloseForm` and settles nothing.
    - Left: the data-driven `CustomForm`, `MessageBox` and observables of 2.1.0 and later throw
      `NotImplementedError`; the disconnect reason BDS gives for a response that is not JSON is
      not captured, so JSPrismarine's is its own.
14. [x] [#3211](https://github.com/JSPrismarine/JSPrismarine/issues/3211) **`@minecraft/server-gametest`.** Also for writing our own scenarios, since BDS runs the
    same tests.
    - Done (2026-11-17): `register`, `registerAsync`, the `RegistrationBuilder` options, `Test`'s
      `succeed`, `fail`, `assert`, `runAfterDelay`, `runAtTickTime`, `idle`, `succeedWhen`, the
      location conversions and the simulated player calls, and `/gametest run`, `runset`,
      `stopall` and `clearall`. A simulated player is a `PlayerSession` whose connection reaches
      no client, so the session manager, commands, chat and other clients list it. The
      `scripting.gametest` family's `gametest` scenario records the runner on BDS.
    - Learned, from the pinned BDS 1.26.51.1: `/gametest` has `clearall`, `create`, `pos`, `run`,
      `runset`, `runsetuntilfail`, `runthese`, `runthis` and `stopall`, and no `runall`. `runset`
      with no tag runs `suite:default`, which an untagged test is not in, and says `No tests found
      for tag 'suite:default'`; `runset jsp` also ran an untagged test of class `jsp`. `register`
      after startup returns a builder and the test runs.
    - Learned: a test with a batch ran before the 12 tests without one, which started 4 ticks after
      it ended. Every structure loads before any test function runs, and the functions run in
      registration order. A missing structure fails the test with `Failed to spawn test structure
      with path 'structures/jsp/late.mcstructure'`. `succeed` and `fail` end a test at once, and
      later members throw `GameTestCompletedError` (`GameTest jsp:succeeds has already completed and
      can no longer access method: succeed`, reason `Done`), except `isCompleted`. A failed
      `assert` throws `GameTestError` with type `Assert`, which a script can catch. `maxTicks(5)`
      failed the test 5 ticks after it started with `Didn't succeed or fail within 5 ticks`, and its
      `Test` threw `object bound to prototype does not exist` in that tick. `runAfterDelay(2)` ran 2
      ticks after the start, `idle(3)` resolved 3 ticks after it, and `succeedWhen` ran its callback
      once when called and once each tick after. A test's simulated players are gone 3 ticks after
      it passes. `worldLocation({ x: 1, y: 2, z: 1 })` of a test at `(0, -60, 0)` is `(1, -58, 1)`.
    - Learned: `removeSimulatedPlayer` sends `world.beforeEvents.playerLeave` and makes the player
      invalid in the call, and `world.afterEvents.playerLeave` follows in the next tick, so a
      player who leaves during a flush is reported in the next one.
    - Left: `.mcstructure` blocks are placed, but their block entities and entities are not; a
      simulated player has no physics, so it walks and jumps on a straight line and does not fall;
      `useItem` returns false; `maxAttempts`, `padding`, `rotateTest` and `setupTicks` are kept and
      not acted on; the batch callbacks, `GameTestSequence`, the navigation and block-interaction
      members of `SimulatedPlayer` and most `Test` assertions throw `NotImplementedError`.
15. [x] [#3212](https://github.com/JSPrismarine/JSPrismarine/issues/3212) **`@minecraft/server-net` and `@minecraft/server-admin`.** Responses as inputs, and the
    permissions BDS requires.
    - Done (2026-11-18): `http.get`, `http.request` and `http.cancelAll`, `HttpRequest`,
      `HttpHeader` and `HttpResponse`, and `variables`, `secrets`, `SecretString` and
      `transferPlayer`. A request runs off the tick on `node:http`, and its result is an input
      that the input step admits and records, as a chunk completion is; a replay admits the
      recorded results and never reaches the network. The `scripting.net` family's `net-http`
      scenario runs against a local HTTP server and matches BDS; the `scripting.admin` family's
      `admin-config` scenario matches but for one gap. This covers the corpus's use of both
      modules: `samples-howto-gallery-betas` (`http.request`, `HttpRequest`, `HttpHeader`,
      `HttpRequestMethod.Post`, `variables.get`, `secrets.get`), `chestlock` (`transferPlayer`) and
      `lushway`, which declares both and calls neither.
    - Learned, from the pinned BDS 1.26.51.1: the builders and `SecretString`'s constructor are
      not early execution, though `http.get` is, and a constructor's privilege error says `Native
      constructor for [HttpRequest]`. BDS's client is `libhttpclient/1.0.0.0`: it sends `Accept:
      */*`, no `Connection`, a `Content-Length` only with a body, and no body for `Get` or `Head`;
      it follows no redirect and gives response header names in lower case. A scheme other than
      `http` or `https` rejects with `MalformedUriError` naming the scheme, empty when there is
      none; a refused connection rejects with `InternalHttpRequestError` and code 111, and a
      timeout with `E_FAIL` (-2147467259). `cancelAll` rejects every request in flight with a
      plain `Error` of its reason.
    - Learned: `request.headers` is one array per request that each read fills again with new
      `HttpHeader`s, so a pushed element stays and a list read before `addHeader` grows with it.
      `variables.get` copies the value with object keys in byte order, `secrets.get` makes a new
      `SecretString` each time, a secret that is not a string is dropped with a warning, and
      `transferPlayer` checks its options as a whole, a port past 65535 included.
    - Left: `variables.names` lists the file's order, where BDS lists its hash map's
      ([#3249](https://github.com/JSPrismarine/JSPrismarine/issues/3249)); a NetherNet
      `transferPlayer` sends nothing, as its packet is not captured; the replay trace does not
      write the recorded results to its file yet, as with the clock
      ([#3226](https://github.com/JSPrismarine/JSPrismarine/issues/3226)); the WebSocket
      client, the packet events, `HttpResponse.deserialize`, the request limit, the allow list,
      the level storage, `asyncPlayerJoin` and the operator and kick functions throw
      `NotImplementedError`.
16. [x] [#3213](https://github.com/JSPrismarine/JSPrismarine/issues/3213) **`@jsprismarine/server`.** The first JSP-only members, the npm typings package, and a
    docs page with the detect-and-fall-back pattern.
    - Done: the module exports `jsprismarine`, a frozen object with the server's `name`,
      `version`, `minecraftVersion` and `protocolVersion`, which the embedder passes to
      `WorldScripts`. One definition in `packages/script-host/src/host/jsprismarineServer.ts`
      builds each pack's namespace, the typings and the member table on the
      [guide page](../guide/jsprismarine-module.md). The `jsp-detect` scenario of
      `scripting.lifecycle` shows the pattern.
    - Learned: the npm name `@jsprismarine/server` is the server package's, so the typings are
      `@jsprismarine/script-types`, which declares the module by name for a project's `types`. It
      stays private with the script host until slice 18. BDS 1.26.51.1 rejects a static import
      of the module with the same `Module [@jsprismarine/server] is unrecognized` message as
      `import()`, so the file that holds it does not load. An `async` callback passed straight to
      `system.run` or `subscribe` never ran past its first `await`, because the host called it
      outside its pack's context; it now runs in the pack's context.
    - Left: no member that acts on the world yet. A pack feature-tests a member a later version
      adds with `'name' in module`.
17. [x] [#3214](https://github.com/JSPrismarine/JSPrismarine/issues/3214) **The docs.** Rewrite [Extending JSPrismarine](../guide/extending.md) around script packs,
    with embedding as the lower-level option.
    - Done (2026-11-18): the guide opens with script packs: building the script host, installing a
      pack and BDS's `config/` folder, the Beta APIs experiment, the modules and versions served,
      how to read the load-time coverage lines, and what replay changes for a script. Packs
      without scripts and embedding follow, unchanged. The module table, the version a declared
      major resolves to, the steps per millisecond, the build platforms and the Beta APIs
      experiment id are docs facts read from `@jsprismarine/script-host` and `prismarine`.
    - Left: the debugger section says only that support is in progress, until slice 7's VS Code
      check runs; the page tells readers to build the script host from a checkout until slice 18
      publishes it.
18. [ ] [#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215) **Every platform.** The native builds for each platform ADR 0006 lists. Then drop `"private": true` from `@jsprismarine/script-host` and list it again in the docs site's
    `packageAreas.ts`.
19. [ ] [#3216](https://github.com/JSPrismarine/JSPrismarine/issues/3216) **scriptc.** The scriptc binding over the same C layer, once the server compiles under
    scriptc.
20. [x] [#3217](https://github.com/JSPrismarine/JSPrismarine/issues/3217) **The rest.** `debug-utilities`, `diagnostics` and `server-graphics`, as the corpus asks.
    - Done (2026-11-18): the corpus uses only `@minecraft/debug-utilities`, in the beta packs
      `canopy`, `construct` and `lushway`: the shape constructors, `color`, `scale`, `timeLeft`,
      `DebugBox.bound`, the arrow's head, `DebugText.setText` and `useRotation`, and
      `debugDrawer.addShape` and `removeShape`. No pack declares `@minecraft/diagnostics` or
      `@minecraft/server-graphics`. Every shape class and `debugDrawer` now have behavior, and
      `disableWatchdogTimingWarnings` does nothing, as the watchdog never warns about time. The
      drawer hands `ScriptWorld.drawDebugShapes` the shapes that changed at the end of each flush,
      and Prismarine sends them as `PrimitiveShapesPacket`s, with every drawn shape to a player who
      joins. The `scripting.debug` family's `debug-shapes` scenario matches BDS on all 81
      observations.
    - Learned, from the pinned BDS 1.26.51.1: a float property keeps what a 32-bit float keeps
      (`scale = 1.1` reads `1.100000023841858`), an integer one drops its fraction, and colors and
      scales outside their usual range are kept. `timeLeft` sets `totalTimeLeft` too. A dimension
      given to `addShape` does not become the shape's `dimension`. A `RawMessage` text reads back
      inside `rawtext`. A shape taken out of the drawer loses one more tick's time. A shape whose
      time ran out keeps reading 0, and adding it again does not restart it.
    - Learned: BDS takes each frame's elapsed time off a drawn shape's `timeLeft`, which went
      from 0.007 to 0.057 seconds a tick in the captures. JSPrismarine takes off 0.05 seconds a
      tick, so a replay counts the same, and the scenario records which way each count moved
      rather than its values.
    - Learned: BDS words a setter's conversion error with `Function return value` where an
      argument's says `Function argument [n]`, for `@minecraft/server` setters such as
      `ItemStack.amount` too. A plain object where a class instance belongs is `Object did not have
      a native handle.`, a float property's bounds error leaves the value out and gives the float
      range (`[0, 340282346638528859811704183484516925440.00]`), and a variant lists its types
      primitives first, then classes and interfaces, then arrays, each in the metadata's order. The
      runtime now does all four for every module. A bounds error also leaves its text on BDS's
      error stack, and the next conversion error's message carries it; the runtime does not copy
      that.
    - Left: `collectRuntimeStats`, `collectPluginStats`, the diagnostics classes, all of
      `@minecraft/diagnostics` and all of `@minecraft/server-graphics` throw `NotImplementedError`
      ([#3262](https://github.com/JSPrismarine/JSPrismarine/issues/3262)). The wire's sphere
      segments and a cylinder's pair of radii per axis are guesses no capture checks yet.
      `@minecraft/server`'s own `primitiveShapesManager` and `TextPrimitive`, which one stable
      corpus pack uses, have no behavior
      ([#3261](https://github.com/JSPrismarine/JSPrismarine/issues/3261)).

## Risks

- **The API is large and keeps moving.** Mojang ships a new `@minecraft/server` version with most
  game releases. Generation makes the shape a regeneration, and behavior stays a hand-written
  backlog that the coverage counts make visible.
- **BDS behavior that the docs leave out.** Event order inside a tick, error messages and edge
  cases are only knowable by running BDS. The parity family is the source of truth, not the docs.
- **The debugger needs an engine patch.** koush's patch is about 450 lines of `quickjs.c` and
  must keep applying across QuickJS releases. Slice 7 sizes the port.
- **The engine differs from BDS's.** Ours is a newer QuickJS. Hidden globals are tested, and
  parser differences such as the regular expression `v` flag are recorded gaps.
- **A JavaScript engine is attack surface.** Packs come from strangers. The pin follows releases,
  and the sandbox exposes nothing outside the bindings.
- **`node:ffi` is experimental.** The native networking package already depends on it. A
  Node-API addon is the fallback ADR 0023 names.
- **Host calls cost an FFI crossing each.** Slice 3 counts them, and bindings for reads made often
  are designed to batch.
- **Step budgets differ from milliseconds.** A script BDS lets finish may stop on JSP, or the
  reverse. The default ratio comes from corpus runs, and an admin can change it.
- **Beta churn.** Beta modules can break on any minor release, so each BDS bump can change what a
  beta pack sees. The regenerated shape's diff shows it, and corpus packs pinned to a beta BDS no
  longer ships fail their fetch-and-load row with that reason.
- **Two lifecycles.** Version 1 and version 2 differ in startup and promise timing, and both stay
  in use for years.

## Open questions

- The default ratio from milliseconds to steps.
- The rest are in the research note's open questions.
