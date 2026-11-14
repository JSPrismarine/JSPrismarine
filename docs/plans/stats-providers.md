# Stats providers and bStats

Started 2026-11-12. Phases 1 to 6 are built on this branch, and phase 7, the maintainer's review,
is still to come. [Design](#design) describes the code as it now stands, after the
[review on 2026-11-12](#review-2026-11-12). [What we know](#what-we-know) and
[Decisions](#decisions) keep what was found and settled when the plan was written, and
[Open questions](#open-questions) lists what is not settled.

## Goal

Report anonymous usage statistics to [bStats](https://bstats.org) as a proof of concept, built on a
stats system that is not tied to bStats.

The server collects its numbers in one place. Providers read them and send them somewhere, the way
`Transport` lets RakNet and NetherNet carry the same sessions. bStats is the first provider.

Requirements from the request and from the bStats maintainer:

- The server reports as a server implementation, to the `server-implementation` endpoint, with
  most data sent as custom charts.
- The bStats settings live in their own section of `config.json`, with attribution. The maintainer
  agreed to this in place of a separate `bStats.txt`.
- Operators can opt out. The submit delay and frequency match the reference implementations.
- The work stays on a branch until the maintainer has looked at it.
- Addons reach bStats later through feature detection in the scripting runtime. That is out of
  scope here, and the design must leave room for it.

## What we know

Facts gathered on 2026-11-12.

### bStats wire protocol

From [`MetricsBase.java`](https://github.com/Bastian/bstats-metrics/blob/master/base/src/main/java/org/bstats/MetricsBase.java)
and [`bstats-pmmp`](https://github.com/Bastian/bstats-pmmp) (`src/Metrics.php`,
`src/MetricsConfig.php`, `src/SubmitDataTask.php`, `src/charts/`). Both repositories are MIT.

- **Request:** `POST https://bStats.org/api/v2/data/<platform>`, body gzip-compressed JSON.
- **Headers:** `Accept: application/json`, `Connection: close`, `Content-Encoding: gzip`,
  `Content-Type: application/json`, `User-Agent: Metrics-Service/1`. Java also sends
  `Content-Length`.
- **Payload:** platform fields at the top level, then `serverUUID`, `metricsVersion` and one
  `service` object holding `id` (the service ID from bstats.org) and `customCharts`.
- **`metricsVersion`:** Java sends `3.2.2-SNAPSHOT`, the PHP class sends `1.0.0`. Which value a new
  implementation sends is a question for the maintainer.
- **Timing:** one submit after a random 3 to 6 minutes, then a repeating submit that starts a
  further random 0 to 30 minutes later and runs every 30 minutes. Both sources warn that changing
  the delay or frequency, or removing the opt-out, gets a service banned.
- **Opt-out:** `enabled` is checked before scheduling and again at every submit.

Each chart is `{"chartId": "<id>", "data": {...}}`. A chart with nothing to say is left out of
`customCharts`, and a chart whose callback throws is skipped:

| Chart              | `data`                             | Left out when                                    |
| ------------------ | ---------------------------------- | ------------------------------------------------ |
| `SimplePie`        | `{"value": "<string>"}`            | The value is empty                               |
| `SingleLineChart`  | `{"value": <int>}`                 | The value is 0                                   |
| `AdvancedPie`      | `{"values": {key: int}}`           | Every entry is 0; zero entries are dropped       |
| `MultiLineChart`   | `{"values": {key: int}}`           | Same as `AdvancedPie`                            |
| `DrilldownPie`     | `{"values": {key: {inner: int}}}`  | Every inner map is empty                         |
| `SimpleBarChart`   | `{"values": {key: [int]}}`         | The map is empty                                 |
| `AdvancedBarChart` | `{"values": {key: [int, ...]}}`    | Every list is empty                              |

### Velocity as the server-implementation reference

From [`Metrics.java`](https://github.com/PaperMC/Velocity/blob/dev/3.0.0/proxy/src/main/java/com/velocitypowered/proxy/Metrics.java).
Velocity is GPLv3, so we read it for behavior and copy no code from it.

- **Platform:** `server-implementation`, service ID 4752.
- **Platform data:** only `osName`, `osArch`, `osVersion` and `coreCount`. It sends no service data
  and no `pluginVersion`.
- **Charts:** `players` and `managed_servers` (`SingleLineChart`), `online_mode` and
  `velocity_version` (`SimplePie`), `java_version` (`DrilldownPie`, `Java 21` then the full
  version).
- **First run:** when it creates the config, it logs that metrics are collected and how to opt out.

### The bStats config file

From [`MetricsConfig.java`](https://github.com/Bastian/bstats-metrics/blob/master/base/src/main/java/org/bstats/config/MetricsConfig.java).

- **Keys:** `enabled`, `server-uuid`, `log-errors`, `log-sent-data`, `log-response-status-text`.
- **Header:** six comment lines that explain what bStats collects and link to
  `https://bstats.org/docs/server-owners`.
- **UUID:** a random version 4 UUID, generated once. It identifies the server across restarts, so
  losing it counts the server twice.
- **Location:** the maintainer's note says the location cannot change after release without
  breaking backwards compatibility.

### This repository

- **Kernel modules:** `Server.buildKernel()` in `packages/prismarine/src/Server.ts` registers one
  module per manager. A module provides a service under a token from
  `packages/prismarine/src/modules/tokens.ts`, opens I/O in `start()` and closes it in `stop()`.
- **The pattern to mirror:** `Transport` in `packages/prismarine/src/network/transport/Transport.ts`
  is an interface with several implementations, combined by `MultiTransport` and chosen by the
  `enable-raknet` and `enable-nethernet` config keys.
- **Config:** `ConfigBuilder` reads and writes `config.json` one key at a time, keeps comments, and
  writes a comment above a key the first time it persists its default. Keys can be paths, and
  `worlds` is already a nested section. `Config.ts` renames old keys with `config.rename`.
- **Data on hand:** player count from `SessionManager.getAllPlayers()`, `online-mode` and the
  enabled transports from `Config`, software and Minecraft versions from `about()`, each player's
  device OS from `Player.device.os`, and TPS from the ticker.
- **Build stamps:** `.github/scripts/set-build-metadata.mjs` stamps `BUILD_TYPE` (`release` or
  `nightly`), `BUILD_VERSION` and `BUILD_FLAVOR` into a built server. A server run from source has
  none of them.
- **Nothing exists yet:** no stats, telemetry or bStats code, and no outbound HTTP client in
  `packages/prismarine`.
- **No plugin loader:** `docs/guide/extending.md` says a plugin today is a program that embeds
  `@jsprismarine/prismarine`.

## Design

### Three parts

```
server state ──> StatsRegistry ──> StatsProvider (bStats)
                 (named metrics)   StatsProvider (an embedder's, passed as statsProviders)
```

**Metrics.** A metric is a name, a kind, a `description`, an optional `unit` and a `read()`
function that returns the current value. The registry reads a metric only when a provider asks, so
nothing runs per tick.

| Kind           | Value                                    | Example                         |
| -------------- | ---------------------------------------- | ------------------------------- |
| `gauge`        | `number`                                 | Players online                  |
| `label`        | `string`                                 | Server version                  |
| `set`          | `readonly string[]`                      | Enabled transports              |
| `distribution` | `Record<string, number>`                 | Players per device platform     |
| `breakdown`    | `Record<string, Record<string, number>>` | Players per release, then protocol |

A metric whose `read()` returns `undefined` is left out of the reading. The kinds describe the
data, not a chart: the metrics are raw values, and a provider decides how to draw them. The
`description` (`Players online.`) and the `unit` (`players`) are there for a provider that shows
metrics to people. Names are `snake_case` and namespaced (`jsprismarine:player_protocol`), so an
addon can register `myaddon:something` later without a new mechanism. `ServerMetric` in
`stats/serverMetrics.ts` holds the server's eight names, and `serverMetrics()` builds the eight
metrics from the config and the session manager.

**Platform.** Beside the metrics, a snapshot carries one `platform` object, the host as
`node:os` describes it. It is the same for every provider, and a provider that needs another form
maps the fields itself:

| Field       | Source                                    |
| ----------- | ----------------------------------------- |
| `type`      | `os.type()`, such as `Darwin`             |
| `release`   | `os.release()`, such as `23.5.0`          |
| `version`   | `os.version()`, such as `Windows 11 Pro`  |
| `arch`      | `os.arch()`                               |
| `coreCount` | `os.availableParallelism()`               |
| `memoryGb`  | `os.totalmem()`, rounded to whole GB      |

**Registry.** `StatsRegistry.register(metric)` checks the name, refuses a duplicate and returns a
function that removes the metric again. `read(name)` reads one metric, and `snapshot()` reads
every metric once with the platform. A metric that throws is logged as a warning and left out. A
module that registers a metric in its `start()` disposes it in its `stop()`, so a kernel restart
registers it again.

**Providers.** A provider is the equivalent of a transport:

```typescript
interface StatsProvider {
    readonly id: string;
    start(context: StatsProviderContext): Promise<void> | void;
    stop(): Promise<void> | void;
}
```

The context holds three things: the `registry`, a `logger` scoped to the provider's id, and
`setTimer`, an unreferenced `setTimeout` that returns a cancel function. A provider owns its
schedule, because schedules differ: bStats dictates one, and a scrape endpoint would have none.
Anything else a provider needs, such as `fetch` or a random source, it takes in its own
constructor, so the context stays the same for every provider. `stop()` may run while `start()` is
still pending, and again when it returns, so it must be safe to call twice.

**Two kernel modules.** `prismarine:stats` provides the registry under `statsToken` in its
`register()`, with the server's metrics in it, and does nothing on start or stop.
`prismarine:stats-providers` depends on `statsToken` and starts the providers in order, then stops
them in reverse. `Server.buildKernel()` registers the registry first and the providers last. The
split lets any module depend on `statsToken` and register a metric in its own `register()` or
`start()`, and the providers still start after every module the server registers, so their first
reading has those metrics. A provider that throws on start or stop is logged and skipped.

**Embedders.** `new Server({ statsProviders })` takes providers of the embedder's own. They run
after the built-in bStats provider, start after it and stop before it. The package exports the
types they need: `StatsProvider`, `StatsProviderContext`, `StatsTimer`, `StatsRegistry`,
`StatsSnapshot`, `StatsPlatform`, the metric types, and `ServerMetric`.

### The bStats provider

- **Service:** `service.ts` exports the service name and ID as constants, `JSPrismarine` and
  `35257`, and nothing else in the code spells them.
- **Charts:** `BSTATS_CHARTS` in `charts.ts` lists the custom charts. Each has a title, a
  description, its bstats.org settings and a `build` function that composes the chart's data from
  a snapshot, so one chart can read several metrics (`build_type` reads the build type and the
  version) or none (`memory` reads the platform). The table is the allowlist: a metric no chart
  reads never reaches bStats.
- **Chart IDs:** chart names are `snake_case`, and bStats chart IDs are camelCase. `chartId()`
  derives the ID (`player_protocol` becomes `playerProtocol`), so each name is written once. The
  IDs must match the charts created on the bstats.org service page.
- **Default charts:** bStats fills `servers`, `coreCount`, `osArch`, `os`, `location` and
  `locationMap` itself, and their IDs are fixed. `chartId()` rejects a name that maps onto one of
  these six.
- **OS mapping:** `bstatsOs()` in `os.ts` turns the platform into the `osName` and `osVersion`
  Java's `os.name` and `os.version` would hold, since bStats' OS chart parses those. Linux keeps
  its name and kernel release. Darwin becomes `Mac OS X` with the macOS version. Windows becomes
  its edition, such as `Windows 11` or `Windows Server 2022`, with `10.0`. A host that calls
  itself Windows 10 at build 22000 or later is reported as Windows 11. Any other OS keeps the name and release `node:os` gives it.
- **Payload:** `osName`, `osArch`, `osVersion` and `coreCount`, then `serverUUID`,
  `metricsVersion` (`0.1.0`) and `service`. bStats has no platform field for memory, so
  `memoryGb` goes out as the `memory` chart.
- **Transport:** `node:zlib` gzip and `fetch` from the constructor options, with a 10 second
  timeout. No new dependency.
- **Schedule:** the reference timing, on the context's timer and the random source from the
  options.
- **Settings read once per start.** The provider reads its gate, the UUID and the logging
  switches when it starts, and nothing it reads can change while it runs: `/reload` stops the
  kernel, reads the config again and starts the provider anew.
- **Failure:** a failed submit is dropped and logged only when `log-errors` is on. It never throws
  into the server. A `429`, which bStats answers when it already has a submit from this server in
  the 30-minute window, is not a failure.
- **Shutdown:** `stop()` cancels the next submit and aborts a request in flight.

Charts:

| Chart              | bStats chart ID   | Type              | Built from                                                      |
| ------------------ | ----------------- | ----------------- | --------------------------------------------------------------- |
| `players`          | `players`         | `SingleLineChart` | The `players` gauge                                             |
| `build_type`       | `buildType`       | `DrilldownPie`    | The `build_type` label, then the `version` label                |
| `memory`           | `memory`          | `SimplePie`       | The platform's `memoryGb`, as `8 GB`                            |
| `online_mode`      | `onlineMode`      | `SimplePie`       | The `online_mode` label                                         |
| `transports`       | `transports`      | `AdvancedPie`     | The `transports` set, 1 per enabled transport                   |
| `player_platform`  | `playerPlatform`  | `AdvancedPie`     | The `player_platform` distribution                              |
| `player_protocol`  | `playerProtocol`  | `DrilldownPie`    | The `player_protocol` breakdown                                 |
| `player_transport` | `playerTransport` | `AdvancedPie`     | The `player_transport` distribution                             |

**Build type.** `buildType()` in `version.ts` decides `dev`, `nightly` or `release`:

- A release or nightly executable carries the `BUILD_TYPE` stamp from
  `.github/scripts/set-build-metadata.mjs`, and reports it.
- The npm package has no stamp. Its `vite build` sets `BUILD_DIST` when CI runs it, which is where
  the published package is built, and the version decides: a prerelease such as
  `0.21.0-unstable-20261112121906` is `nightly`, any other version `release`.
- A checkout is `dev`, whether it runs from source or through `pnpm dev` and `pnpm start`, which
  load a package build made on that machine.

**Player platforms** are display names from `DEVICE_OS_NAMES` in `serverMetrics.ts`, such as
`Android`, `iOS` and `Nintendo Switch`, one per `BuildPlatform` member. A value the client sends
that is not a member counts as `Unknown`.

### Charts to create on bstats.org

Create these as custom charts on the JSPrismarine service page. The ID has to match exactly. The
title and the type-specific settings can change later.

The type-specific settings are the ones bStats stores per chart, read on 2026-11-12 from
`https://bstats.org/api/v1/plugins/4752/charts` (Velocity):

- **Single Line Chart:** a line name, and a filter with a minimum and a maximum value.
- **Simple Pie, Advanced Pie and Drilldown Pie:** a filter with a list of values, a regex switch
  and a blacklist switch. An Advanced Pie and a Drilldown Pie also have a numeric max value. Every
  filter below is an allowlist, so blacklist stays off.

| ID                | Title               | Type              | Line name | Max value | Filter                                        |
| ----------------- | ------------------- | ----------------- | --------- | --------- | --------------------------------------------- |
| `players`         | Players Online      | Single Line Chart | `Players` |           | Off                                           |
| `buildType`       | Build Type          | Drilldown Pie     |           | 1         | Values `dev`, `nightly`, `release`            |
| `memory`          | Memory              | Simple Pie        |           |           | Regex `[0-9]{1,4} GB`                         |
| `onlineMode`      | Online Mode         | Simple Pie        |           |           | Values `online`, `offline`                    |
| `transports`      | Enabled Transports  | Advanced Pie      |           | 1         | Values `RakNet`, `NetherNet`                  |
| `playerPlatform`  | Player Platform     | Advanced Pie      |           | 1000      | Off                                           |
| `playerProtocol`  | Player Game Version | Drilldown Pie     |           | 1000      | Regex `[0-9]{1,2}\.[0-9]{1,3}(\.[0-9]{1,3})?` |
| `playerTransport` | Player Transport    | Advanced Pie      |           | 1000      | Values `RakNet`, `NetherNet`                  |

- **Filters keep made-up values out.** Anybody can post to the endpoint, so a chart with a closed
  set of values gets an allowlist. The provider has to send exactly these strings, and phase 2
  tests that it does.
- **`playerPlatform` has no filter**, because device names grow with the game.
- **An Advanced Pie and a Drilldown Pie take a numeric max value**, the most one entry may count.
  `buildType` sends one inner entry with the value 1, and `transports` sends 1 per enabled
  transport, so their max is 1. The player charts send player counts, so their max is the most
  players one server may plausibly report, 1000 here. Velocity's `java_version` has it at 0, which
  this plan reads as no limit.
- **No chart needs an axis label.** That setting belongs to bar charts and maps, and none of these
  is one.

The default charts already exist, and neither their IDs nor their types can change. Velocity's
settings for them are shown for reference:

| ID          | Type              | Filled from                        | Velocity's setting           |
| ----------- | ----------------- | ---------------------------------- | ---------------------------- |
| `servers`   | Single Line Chart | One count per reporting server     | Line name `Servers`          |
| `coreCount` | Simple Pie        | The `coreCount` platform field     | Regex filter `([0-9]){1,2}`  |
| `osArch`    | Simple Pie        | The `osArch` platform field        | Filter off                   |
| `os`        | Drilldown Pie     | `osName`, then `osVersion`         | Filter off                   |
| `location`  | Simple Pie        | The address the request comes from | Filter off                   |

Velocity also has a default `locationMap` chart, a Simple Map with the value name `Servers`.

### Config

A `server-uuid` at the top level of `config.json`, and a `stats` section with one entry per
provider:

```jsonc
{
    // Identifies this server. Generated on first start.
    "server-uuid": "0b9c6a5e-...",

    "stats": {
        // bStats (https://bStats.org) collects some basic information ...
        // Learn more here: https://bstats.org/docs/server-owners
        "bstats": {
            "enabled": true,
            "log-errors": false,
            "log-sent-data": false,
            "log-response-status-text": false
        }
    }
}
```

- **`server-uuid` belongs to the server**, not to bStats. It is a random version 4 UUID generated
  on first start, and bStats sends it as `serverUUID`. Anything else that needs to tell one server
  from another can use it later.
- **One section per provider** under `stats`, with the bStats header text as the comment above
  `bstats` and the same key names as `bStats.txt`. A second provider adds a sibling, and addons can
  later read the same bStats settings through the runtime.
- **An unwritable config stops the provider.** A UUID that changes every restart would inflate the
  server count.
- **The config fails closed.** A file with no `stats.bstats` section gets one, with bStats on.
  Once the section exists, bStats reports only for a literal `enabled: true`. A `stats` or
  `stats.bstats` that is not an object, or an `enabled` that is missing, misspelled or not a
  boolean, turns it off with a warning naming the key, and the file is left as it is. A logging
  switch that is missing is written with its default.
- **The paths are fixed once released.** If one ever has to move, `config.rename` carries the
  value over.
- **The first run logs a notice** on the start that writes the `stats.bstats` section, when that
  start reports, naming bStats and the key that turns it off.
- **`JSP_BSTATS` turns bStats off** for containers. `0`, `false`, `off` and `no` turn it off.
  `1`, `true`, `on` and `yes` leave the decision to the config, as an unset variable does. Case
  does not matter, and any other value turns bStats off with a warning. It belongs to the bStats
  provider. The stats system has no switch of its own yet, since bStats is its only provider.
- **A set `CI` turns bStats off**, as every CI service sets it, and so does the Vitest test
  runner. `bstatsOffReason()` in `serverBStats.ts` checks, in order: the test runner, `CI`,
  `JSP_BSTATS`, a config problem, and `enabled: false`.

### Where the code lives

- `packages/prismarine/src/stats/`: `StatsRegistry`, the metric types, `StatsPlatform`,
  `StatsProvider`, and `serverMetrics.ts` with the server's metrics and their names.
- `packages/prismarine/src/stats/bstats/`: `service.ts` (name and ID), `charts.ts`, `os.ts`,
  `payload.ts`, `BStatsProvider.ts` (schedule and submit) and `serverBStats.ts` (the gate and the
  notice for a server).
- `packages/prismarine/src/modules/stats.ts`: the two kernel modules, and `statsToken` in
  `tokens.ts`.

Every server reports by default, whether `@jsprismarine/server` starts it or a program embeds
`@jsprismarine/prismarine`: `Server.buildKernel()` registers the stats module with the bStats
provider. Three things keep that honest:

- **The notice** is logged on the start that writes the section, when it reports, and names the
  config key that turns it off.
- **The comment** above `stats.bstats` in `config.json` says what is sent and how to opt out.
- **Tests never send.** The provider does not start under Vitest, with `CI` set or with
  `JSP_BSTATS=0`, and its `fetch` is a constructor option, so a unit test hands it a stub. The
  client e2e server and the executable smoke test set `JSP_BSTATS=0`.

The bStats code lives inside `stats`, which lives inside `prismarine`, and stays out of the public
barrel. The barrel exports the stats types an embedder needs, not the bStats provider. bStats may
get its own package later.

### Addons, later

The maintainer's note says plugin support needs changes on bStats' end, so this plan only keeps the
door open:

- Metric names are namespaced, so an addon registers its own.
- The bStats provider can grow from one `service` to several without changing the registry.
- The scripting runtime exposes a module that an addon feature-detects. Removing bStats removes the
  module, and the addon's check fails cleanly.

## Testing

Every test drives the real code with a manual timer, fixed random values and a stub `fetch`. No
test sends a request or asserts a duration.

- **Registry:** a snapshot reads each metric once, a throwing metric is left out, and a disposed
  metric is gone.
- **Charts:** each chart type produces the shape in the table above and is left out under its rule.
- **Chart IDs:** every mapped metric name becomes its camelCase chart ID, and a name that maps onto
  a default chart ID is rejected.
- **Payload:** the stub `fetch` receives the URL, the headers and a gzip body that decodes to the
  expected JSON.
- **Schedule:** with fixed random values, submits happen at the first delay, at the second, and
  every 30 minutes after, and the delays stay inside 3 to 6 and 0 to 30 minutes at both extremes.
- **Opt-out:** `enabled: false`, a malformed `enabled`, each `JSP_BSTATS` off value and an
  unknown one, a set `CI`, a Vitest run and an unwritable config each produce zero calls to
  `fetch`.
- **OS:** each Linux, Darwin, Windows and other host maps to the `osName` and `osVersion` bStats'
  OS parser groups correctly.
- **Notice:** the first start logs it once, and a second start with the section present logs
  nothing.
- **Config:** a first start writes `server-uuid` and the `stats.bstats` section with its comment,
  and a second start reads the same UUID.
- **Build type:** a server with no build stamp reports `dev`, a stamped one reports its
  `BUILD_TYPE`, and a package build reports `nightly` for a prerelease version and `release`
  otherwise.
- **Lifecycle:** `stop()` leaves no pending timer, and a restart of the kernel schedules once.

## Phases

Each phase is one delegated task and one or more local commits. A phase starts from the branch as
the phase before it left it, reads this plan first, and ends with its own tests,
`pnpm run typecheck`, `pnpm run lint` and `pnpm exec vitest run --since-last-run` passing. Tick a
phase off here when it lands.

| Phase | Depends on | Can run beside |
| ----- | ---------- | -------------- |
| 1     |            |                |
| 2     | 1          | 3              |
| 3     |            | 2              |
| 4     | 1, 2, 3    |                |
| 5     | 4          |                |
| 6     | 5          |                |
| 7     | 6          |                |

### Phase 1: the stats seam

- [x] Done

Notes from the build, as the [review](#review-2026-11-12) left them:

- `serverMetrics()` in `stats/serverMetrics.ts` builds the eight server metrics from the config
  and `SessionManager.getOnlineSessions()`, and `Server.buildKernel()` passes them to
  `statsModule` as its `metrics` option. `ServerMetric` in the same file holds the eight names.
  The build first spread the metrics over their owners (`buildTypeMetric` in `version.ts`,
  `configMetrics` in `config/configMetrics.ts`, `SessionManager.metrics()`, and a `memory` metric
  the module registered); the review moved them into one file and made `memory` a chart built
  from the platform.
- `TransportConnection` gained a `transport` field (`RakNet` or `NetherNet`, from
  `TransportNames`), since no connection said which transport carried it.
- `player_platform` keys are display names from `DEVICE_OS_NAMES`, such as `Android` and
  `Windows`, with `Unknown` for a player with no device or an unnamed OS. The build first used
  `BuildPlatform` member names such as `WIN32`.
- `player_protocol` names a protocol by the first release that speaks it, such as `1.26.60`,
  since a client names only its protocol.

**Builds** in `packages/prismarine/src/stats/`:

- The metric kinds (`gauge`, `label`, `distribution`, `breakdown`; the review added `set`) and
  the `StatsSnapshot` type, with its `platform` object.
- `StatsRegistry`: register a metric under a namespaced `snake_case` name, and take a snapshot.
- The `StatsProvider` and `StatsProviderContext` interfaces.
- `packages/prismarine/src/modules/stats.ts` and `statsToken`: the module provides the registry,
  starts its providers in `start()` and stops them in `stop()`. It is registered in
  `Server.buildKernel()` with an empty provider list. The review split it into two modules, as
  [Design](#three-parts) describes.
- The eight server metrics from the chart table, registered by the code that owns each value.

**Leaves out** bStats, config and any network call.

**Done when** tests show that a snapshot reads each metric once, leaves out a metric that throws or
returns nothing, rejects a duplicate or badly formed name, and carries the platform fields; that
each server metric reports the right value for a server with known players and settings; and that
the module starts and stops a stub provider once per kernel start.

### Phase 2: the bStats codec

- [x] Done

**Builds** in `packages/prismarine/src/stats/bstats/`, as pure functions with no I/O:

- `service.ts`: the service name, the service ID and `metricsVersion`.
- The chart table: metric name to chart type, for the eight charts. The review gave each chart a
  `build` function in its place.
- The mapper from a chart name to its camelCase chart ID, which rejects the six default chart
  IDs, `locationMap` included.
- The chart encoders, with the left-out rules from the chart table under
  [bStats wire protocol](#bstats-wire-protocol).
- The payload builder: a `StatsSnapshot` and a server UUID in, the bStats JSON object out.
- The request builder: URL, headers and the gzip body.

**Leaves out** scheduling, `fetch` and config.

**Done when** tests show each chart type's shape and its left-out rule, the chart ID for every
mapped metric, the rejection of a default chart ID, the exact payload for a fixed snapshot, the
filter strings in [Charts to create on bstats.org](#charts-to-create-on-bstatsorg), and a request
body that gunzips back to the payload.

### Phase 3: config

- [x] Done

**Builds** in `packages/prismarine/src/config/`:

- `server-uuid` at the top level: generated on first start, read back unchanged after.
- The `stats.bstats` section with `enabled`, `log-errors`, `log-sent-data` and
  `log-response-status-text`, and the description comment above it.
- Getters on `Config` for the UUID and the bStats settings, and a way to tell that this start
  created the section.
- The `ConfigFile` type, key order, comments and the JSON schema, and whatever
  `firstBoot.test.ts` and `JsonSchemas.test.ts` need.
- `pnpm run docs:facts`, since the config tables are generated.

**Leaves out** the provider, the notice and `JSP_BSTATS`.

**Done when** tests show that a first start writes the UUID and the section with its comment, a
second start reads the same UUID, a hand-edited `enabled: false` is kept, and a malformed UUID is
replaced.

### Phase 4: the bStats provider

- [x] Done

As built, a submit that found `enabled` off ended the schedule, as `MetricsBase.java` does. The
review removed that check: the provider reads its settings once per start, and `/reload` restarts
it.

**Builds** `BStatsProvider` in `packages/prismarine/src/stats/bstats/`:

- The schedule from [bStats wire protocol](#bstats-wire-protocol), on the injected timer and
  random source.
- Submit: snapshot, payload, request, injected `fetch` with a 10 second timeout.
- `enabled` checked before scheduling. The build also checked it at every submit, until the
  review.
- The three logging flags, and a failed submit that never throws into the server.
- `stop()` clears the timers and aborts a request in flight.

**Leaves out** registering the provider on the server.

**Done when** tests with a fake clock, fixed random values and a stub `fetch` show submits at the
first delay, the second delay and every 30 minutes after; both delay ranges at their extremes; no
call when disabled; one log line per flag; no pending timer after `stop()`; and one schedule after
a kernel restart.

### Phase 5: wiring

- [x] Done

`serverBStatsProvider` in `stats/bstats/serverBStats.ts` builds the `BStatsProvider` with the
kernel, and the provider reads the config at each start, after it has loaded, since the kernel is
built before it.

**Builds:**

- `Server.buildKernel()` registers the stats module with the bStats provider, fed by the config
  from phase 3.
- The provider stays off under Vitest, when `JSP_BSTATS=0` is set and when the config file cannot
  be written. The review added `CI` and the other `JSP_BSTATS` values.
- The first-run notice.

**Done when** tests show zero `fetch` calls for each of the three off cases, the notice once on a
first start and not on a second, and a server that starts and stops cleanly with the provider on
and a stub `fetch`. Run `packages/prismarine` and `packages/server` tests in full once, then start
a flat-world server with `log-sent-data` on and check the logged payload by eye, without waiting on
the timer.

### Phase 6: docs and release notes

- [x] Done

**Builds:**

- A page under `docs/guide/` on what the server sends, to whom, and how to opt out, following the
  `human-docs` skill.
- The chart list on that page as a docs fact generated from the chart table in
  `tools/docs/facts.mts`.
- `JSP_BSTATS` wherever the other environment variables are documented.
- A Changeset for `@jsprismarine/prismarine`, after reading `docs/guide/versioning.md`.

**Done when** `pnpm run docs:facts` leaves the tree clean and `pnpm run lint` passes.

### Phase 7: maintainer review

- [ ] Done

Not delegated. Send the branch to the bStats maintainer, as he asked, before it merges.

The OS question this phase first listed is answered. bStats' data processor
([`src/parser/os.rs`](https://github.com/Bastian/bstats-data-processor/blob/master/src/parser/os.rs)
in `Bastian/bstats-data-processor`) fills the `os` chart from `osName` and `osVersion` with Java's
names in mind: a name that starts with `Linux` goes under Linux with the version, `Windows Server`,
`Windows NT` and `Windows` go under their own slices with the name alone, `Mac OS X` goes under Mac
OS X with the version, a name containing `BSD` goes under BSD, and anything else under Other. That
is why `bstatsOs()` sends `Mac OS X` and a Windows edition instead of `node:os`'s `Darwin` and
`Windows_NT`, which would have landed under Other. The same processor reads `metricsVersion` as an
optional string and does not check it.

Bring him three things:

- Whether `0.1.0` is right for `metricsVersion`.
- Confirm where the `location` chart comes from. The processor finds a country for the request's
  address with a GeoIP lookup, and a default chart whose template holds the predefined value
  `%country.name%` reports that country. Ask him to confirm that the `server-implementation`
  templates give `location` this value, so the chart fills with no field from us.
- Tell him the first live submit is still untested: no test or manual run has sent a payload to
  bstats.org.

## Review, 2026-11-12

A review after phase 6 reworked the code before the maintainer sees it. It changed:

- **Metrics are raw values.** The registry holds what the server knows, and bStats composes its
  charts through a `build` function per chart. `build_type` reads two labels, and `memory` reads
  the platform instead of a metric of its own.
- **A `set` kind** for the enabled transports, which the build sent as a distribution of ones.
- **Metric `description` and `unit`**, carried into each reading.
- **`register()` returns a disposer**, and `read(name)` reads one metric.
- **One home for the server's metrics.** `serverMetrics.ts` replaces `buildTypeMetric`,
  `configMetrics.ts`, `SessionManager.metrics()` and `ServerMetric.ts`. `SessionManager` exposes
  `getOnlineSessions()` instead.
- **A slim `StatsProviderContext`**: registry, logger and timer. `fetch` and the random source
  moved to the bStats provider's options, and `now` went.
- **Two kernel modules**, so modules can register metrics before the providers start. Providers
  stop in reverse order, and a stop during a pending start stops that provider.
- **`statsProviders`**, the `Server` option for an embedder's providers, and the stats types in
  the package's exports.
- **Raw `StatsPlatform` fields** (`type`, `release`, `version`), with the bStats OS mapping in
  `os.ts`.
- **The config fails closed**: once the section exists, only a literal `enabled: true` reports.
- **More off switches:** `JSP_BSTATS` takes four off values and four on values, and warns on any
  other, and a set `CI` turns bStats off.
- **`buildType()` reads the version for the npm package**, which carries no stamp, instead of
  calling it `dev`.
- **Player platforms as display names**, and **`locationMap`** among the reserved default chart
  IDs.
- **Settings read once per start**, instead of `enabled` checked again at every submit.
- **A `429` is not a failure**, because bStats answers it for a second submit in the same window.

Left as it is, on purpose:

- **The first-run notice stays tied to the start that writes the section.** A start that writes
  it without reporting, such as one with `CI` set, logs no notice, and later starts do not either.
  Remembering that the notice is still owed would take a persisted marker, which would be a
  visible config key for no operator benefit.
- **A module registered on the kernel after construction starts after the providers.** The
  providers module is registered last in `Server.buildKernel()`, so a module an embedder adds
  later starts after it, and a metric that module registers in `start()` misses the providers'
  first reading. bStats' first submit comes at least 3 minutes after the start, so it still sees
  such a metric.

## Decisions

Settled on 2026-11-12:

- **`metricsVersion`** is `0.1.0`.
- **Config** is nested: `stats.bstats.enabled`.
- **The UUID** is a general `server-uuid` in `config.json`, generated by the server, and bStats
  reads it.
- **Per-player data** such as device OS is published. Reporting is opt-out for the operator.
- **Platform** is one object with OS, architecture, version, core count and memory in GB.
- **Charts** are the eight in the chart table. `runtime_version`, `player_input`, `install_method`,
  `custom_content` and `world_preset` were proposed and dropped.
- **Packaging:** bStats lives in `stats`, inside `prismarine`.
- **Placement:** `server-uuid` sits at the top level of `config.json`.
- **Name:** `stats` for the section, the folder and the token.
- **Default:** every server reports, embedded ones included, with a first-run log notice and a
  description comment inside the config.
- **Environment switch:** `JSP_BSTATS=0` disables bStats. The stats system gets no switch of its
  own for now. The review widened the values it takes, as [Config](#config) lists.
- **Service:** `JSPrismarine`, ID 35257, kept as constants in one file.
- **Charts on bstats.org:** the eight custom charts are created.
- **Naming:** metric names are `snake_case` in the registry and camelCase on bStats, through a
  mapper.

## Open questions

None for the build. Phase 7 lists what to bring the bStats maintainer.
