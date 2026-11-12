# @jsprismarine/client-e2e

End-to-end client verification. The harness boots a disposable JSPrismarine server from this
checkout's sources, joins it with [cinnabar](https://github.com/cinnabar-mc/cinnabar), a real
rendering Bedrock client driven headlessly over MCP, and asserts on what the client simulates and
renders. It complements `packages/client/tools/bringup-probe.mjs`: the probe proves our protocol
bot reaches spawn, while this harness proves a real third-party client plays, and it produces
screenshots and recordings as evidence.

## Prerequisites

- `cargo`, `go`, and `make` on `PATH` (the pinned client is Rust with a Go protocol core).
- `ffmpeg` on `PATH` for recordings; screenshots work without it.
- Network access on the first run: it clones the pin and fetches the vanilla asset pack.
- macOS, Windows, or Linux. Linux also needs `libwayland-dev` and `libudev-dev`.

## Commands

```bash
# Clone and build the latest pinned client (slow once, then a no-op).
pnpm --filter @jsprismarine/client-e2e run ensure

# Select a protocol explicitly when testing a particular server version.
pnpm --filter @jsprismarine/client-e2e run ensure -- --protocol 2193

# Name a transport; the build is the protocol's one either way.
pnpm --filter @jsprismarine/client-e2e run ensure -- --protocol 2225 --transport nethernet

# Run every scenario, or a selection. Independent suites run two at a time by default.
pnpm run e2e:client
pnpm run e2e:client movement chat
pnpm run e2e:client:dist spawn movement
JSP_E2E_FULL_FLUSH_FRAGMENTS=1 pnpm run e2e:client:dist spawn movement
pnpm run e2e:client -- --protocol 2193 movement chat
pnpm run e2e:client -- --compression-algorithm zlib movement chat
pnpm run e2e:client -- --protocol 2225 --transport nethernet spawn
pnpm run e2e:client -- --concurrency 1 --record --artifacts /tmp/evidence
```

`--compression-algorithm` selects the algorithm the scratch server advertises: `snappy` (the
default), `zlib`, or `none`.

`--transport` picks the one transport the scratch server runs, from those the protocol's
`cinnabar.json` entry lists; the runner refuses any other and names the ones it has. Without it, a
run uses the first one listed. Cinnabar has no transport setting: like the game, it probes the
address for NetherNet signaling on the TCP side of the port and falls back to RakNet.
`--transport nethernet` runs against a server with RakNet off, and the boot fails if the port still
answers a RakNet ping. `--transport raknet` turns the server's NetherNet off, so the probe finds
nothing and the client falls back.
A NetherNet join by address shows the game's "Trust this server?" prompt for the server's
self-signed identity; the harness accepts it.

The scratch server runs RakNet on a worker thread, so a tick that overruns its budget does not
stop it answering the client's keepalives and acknowledgements, and the client keeps its session
through a stall. `--no-raknet-worker` runs it on the game thread instead.

Gameplay and dimension scenarios share one server and client; natural spawning uses a separate
server because it needs a cow spawn fixture that could affect gameplay checks. The
`level-isolation` scenario gets a server of its own with a second `worlds` entry, whose mobs and
world every other scenario would also have to tick. The runner resets
the player, inventory, drops, and controls between scenarios, then stops each server and removes
its temporary data. The two suites run concurrently by default; use `--concurrency 1` when
debugging or when passing `--port`. `--record` writes a separate `run.mp4` under each scenario's
artifact directory and leaves the recorded client at full quality. Every other headless client
saves cheap video settings before it launches (muted, frame-capped, short render distance,
reduced render resolution, expensive effects off), so it takes as little of the machine as it can
from the server. Scenarios assert on client state, not pixels, so failure screenshots are blurrier
but the verdicts are the same.

`pnpm run e2e:client:dist` selects the built `Server.js` entry and the workspace's
`jsprismarine:dist` exports. Build it first with `pnpm run server:build`.

The runner prints the artifacts directory (screenshots, recordings, a combined server log, a
server and client log per suite, and the log of each additional client a scenario started, in that
scenario's directory) and exits non-zero when any scenario fails. The root `pnpm run e2e:client`
command also collects V8 coverage from the server processes and writes an LCOV report to
`coverage/client-e2e/lcov.info`. Each server writes a coverage file every <!-- fact:e2e.coverageIntervalSeconds -->10<!-- /fact --> seconds, and each
file repeats the server's whole source map cache, so a full run leaves about a hundred files of
about 35 MB each. `.c8rc.json` sets `merge-async`, so the report reads and merges them one at a
time rather than holding every one in memory at once.

In CI, `.github/workflows/client-e2e.yml` builds a matrix of every declared transport of every BDS
protocol in `packages/bedrock-data/sources.json`, listed by `src/pin-matrix.mts`, and runs the full
suite with the compatibility default (`zlib`) on `ubuntu-latest` for each one, with the client
rendering through Mesa's software Vulkan driver on a virtual X display. The job runs as many suites
at once as the runner's cores and memory allow. A second matrix runs the full suite with `snappy`
and `none` across every supported protocol, covering retail-client negotiation without duplicating
the `zlib` jobs. Each run's job uploads evidence and an LCOV report to Codecov. A preceding job
builds each pinned commit that has no cached build, once however many runs use it. It restores
cargo's compiled dependencies from the closest earlier build, its own protocol's first and then any
other, so a pin bump compiles only the crates that changed, and it links with `mold`. GitHub
Actions saves each finished build, the checkout, the stamp and the binaries the e2e jobs restore,
as one entry per commit, outside its workspace. A build on `master` of the latest protocol also
saves cargo's intermediate directory, which only the next build reads, and a build on `master`
deletes the entries of commits `cinnabar.json` no longer pins. The runner also writes a pass/fail
table to the job summary.

`--retry` runs each failed scenario once more, on a server and client of its own, and CI passes it.
A scenario that passes the second time passes the run, and the job summary and a warning annotation
name it as flaky.

A pull request runs only the scenarios its changes can affect, which `src/select.mts` decides from
the changed files. Every scenario boots the whole server, so a change to anything the server can
load runs them all. A pull request that changes only tests, benchmarks, Markdown or a package the
server does not depend on runs none, and one that changes only files under `src/scenarios/` runs
the scenarios those files define. A push to `master` and a manual run keep every scenario.

## Version pin

`cinnabar.json` gives each wire protocol one cinnabar commit, its build, in `commit`, and lists the
transports that build runs over in `transports`. Bedrock 1.26.60 joins over NetherNet only, and the
project drops RakNet the same way, for newer protocols only: an older protocol's entry lists
`raknet`, and a protocol whose build speaks both lists both. A newly brought-up protocol gets
`"transports": ["nethernet"]`. `pnpm exec vitest run tools/client-e2e` checks the file's shape.

A build belongs to its commit. Its checkout and its Cargo and Go outputs live in one directory named
by the commit's first 12 characters, `$XDG_CACHE_HOME/jsprismarine/cinnabar/<commit>/`, falling
back to `~/.cache/jsprismarine/cinnabar/<commit>/`: the checkout in `repo/`, Cargo's final artifacts
in `target/` and its intermediates in `build/`. Every protocol, transport and worktree that pins the
commit uses that one build, and CI caches it under one key. A commit with no build yet starts from a
copy of a finished build, one of the same commit from an older cache layout if there is one, else
the most recent (a clone on APFS, so it costs no extra disk), so a pin bump compiles only the crates
that changed. When `sccache` is installed, Rust outputs are also reused across builds and
worktrees; on macOS, install it with `brew install sccache`. Its local cache is shared at
`<cache-root>/sccache` and is capped at sccache's 10 GB default. Set `JSP_CINNABAR_CACHE_DIR` to
change the cache root, or set `JSP_CINNABAR_PATH` to use an existing checkout directly (offline, or
while testing a different client commit).

Moving a pin is one edit to `commit`. `ensure` cross-checks the build's Bedrock target
(`assets/bedrock-target.json` in the checkout) against the protocol and the protocols this checkout
serves, and the matrix fails if a newly supported protocol has no pin.

## Interactive driving

`.mcp.json` at the repository root registers the pinned `cinnabar-mcp` controller, so an agent
session can drive the client directly: launch, join a local server, send input, read `state`,
and capture screenshots or recordings. The [client-e2e skill](../../.agents/skills/client-e2e/SKILL.md)
holds the workflow and its rules.

## NetherNet's UDP ports

`--udp-ports` picks where NetherNet's UDP goes, so one transport's run covers each layout
`server-udp-ports` has: `shared` (the default: unset, on the server port beside RakNet), `single`
(one other port), `range` (three other ports) and `range-with-server-port` (three ports starting at
the server port). `--public-ip <address>` sets `server-public-ip`.

```bash
pnpm run e2e:client -- --protocol 2225 --transport nethernet --udp-ports range-with-server-port
```

## Adding a scenario

Add a file under `src/scenarios/` exporting a `Scenario` (see `src/scenario.mts`) and register it
in the compatible suite in `src/run.mts`. A scenario receives its suite's server (console commands, log
matching), its in-world client (input, state, captures), and an artifacts directory. Scenarios in
one suite run sequentially with a reset between them; separate suites can run concurrently, so keep
files inside the provided artifacts directory and avoid shared mutable state. A scenario that starts
additional clients waits until no scenario in another suite has any: on CI's software renderer, a
fresh client's loading screen runs past its join budget when another one loads beside it. Assert
with `node:assert/strict` and throw to fail; the runner joins the client before the first scenario.
