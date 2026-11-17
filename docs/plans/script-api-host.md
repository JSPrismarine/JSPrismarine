# Run Bedrock behavior pack scripts

Started 2026-11-16. This plan is a working document: tick slices off, and add or reshape them as
the work teaches us things. Nothing past slice 2 starts before the plan is approved.

## Goal

Unmodified Bedrock add-ons whose behavior packs carry `@minecraft/server` scripts run on
JSPrismarine and behave as they do on the pinned Bedrock Dedicated Server (BDS). Script packs
become JSPrismarine's primary plugin format.

The decisions that carry it:

- Each world runs its packs' scripts in one embedded QuickJS runtime on the world's own thread.
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
- **The world seam.** A narrow interface that `prismarine` implements for each world: reads by id,
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
6. [ ] [#3203](https://github.com/JSPrismarine/JSPrismarine/issues/3203) **The skeleton.** The milestone that proves every mechanism once:
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
7. [ ] [#3204](https://github.com/JSPrismarine/JSPrismarine/issues/3204) **The debugger.** The protocol the VS Code extension speaks, `/script debugger
   listen|connect|detach` and the `script-debugger-*` properties, over koush's debugger patch
   ported to the pinned QuickJS. Planned with the skeleton, and split into its own slice right
   after it if the port is large.
   - Done when VS Code attaches and stops at a breakpoint in a scenario pack.
8. [ ] [#3205](https://github.com/JSPrismarine/JSPrismarine/issues/3205) **The corpus.** The manifest, the fetch script and the usage counter, starting from the
   candidates in the research note. Count beta packs too. Order slices 9 onward by the counts.
9. [ ] [#3206](https://github.com/JSPrismarine/JSPrismarine/issues/3206) **Beta modules.** Right after the skeleton, because most open-source add-ons in the corpus
   depend on a beta `@minecraft/server`.
   - The Beta APIs experiment as a world setting, sent to clients and required by a pack that
     declares a `-beta` version, with BDS's message when it is off.
   - The generated shape of each beta version the pinned BDS ships. Beta versions do not follow
     semver, so a `scripting.lifecycle` row records what BDS does with a pack that names another
     beta version.
   - From here on, breadth slices implement a member in the stable and beta shapes together.
10. [ ] [#3207](https://github.com/JSPrismarine/JSPrismarine/issues/3207) **Core server breadth.** Players, entities, blocks, dimensions, items and the events the
    corpus uses most, in batches. Each batch names the corpus packs it makes run.
11. [ ] [#3208](https://github.com/JSPrismarine/JSPrismarine/issues/3208) **Custom components.** `registerCustomComponent` for blocks and items registers into the
    behavior registry of the [data-driven plan](data-driven-vanilla.md), through an adapter from
    the 15 block hooks and 7 item hooks. Custom commands register into the command tree.
12. [ ] [#3209](https://github.com/JSPrismarine/JSPrismarine/issues/3209) **Persistence.** Dynamic properties and script scoreboards, byte-compatible with BDS and
    checked by the LevelDB compatibility suite in both directions.
13. [ ] [#3210](https://github.com/JSPrismarine/JSPrismarine/issues/3210) **`@minecraft/server-ui`.** Forms, over the modal form packets.
14. [ ] [#3211](https://github.com/JSPrismarine/JSPrismarine/issues/3211) **`@minecraft/server-gametest`.** Also for writing our own scenarios, since BDS runs the
    same tests.
15. [ ] [#3212](https://github.com/JSPrismarine/JSPrismarine/issues/3212) **`@minecraft/server-net` and `@minecraft/server-admin`.** Responses as inputs, and the
    permissions BDS requires.
16. [ ] [#3213](https://github.com/JSPrismarine/JSPrismarine/issues/3213) **`@jsprismarine/server`.** The first JSP-only members, the npm typings package, and a
    docs page with the detect-and-fall-back pattern.
17. [ ] [#3214](https://github.com/JSPrismarine/JSPrismarine/issues/3214) **The docs.** Rewrite [Extending JSPrismarine](../guide/extending.md) around script packs,
    with embedding as the lower-level option.
18. [ ] [#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215) **Every platform.** The native builds for each platform ADR 0006 lists.
19. [ ] [#3216](https://github.com/JSPrismarine/JSPrismarine/issues/3216) **scriptc.** The scriptc binding over the same C layer, once the server compiles under
    scriptc.
20. [ ] [#3217](https://github.com/JSPrismarine/JSPrismarine/issues/3217) **The rest.** `debug-utilities`, `diagnostics` and `server-graphics`, as the corpus asks.

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
