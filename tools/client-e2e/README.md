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

# Build a protocol's NetherNet pin instead of its RakNet one.
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

`--transport` picks the one transport the scratch server runs. Cinnabar has no transport
setting: like the game, it probes the address for NetherNet signaling on the TCP side of the port
and falls back to RakNet. `--transport nethernet` runs the protocol's NetherNet pin against a
server with RakNet off, and the boot fails if the port still answers a RakNet ping. The default,
`raknet`, turns the server's NetherNet off, so the probe finds nothing and the client falls back.
A NetherNet join by address shows the game's "Trust this server?" prompt for the server's
self-signed identity; the harness accepts it.

The scratch server runs RakNet on a worker thread, so a tick that overruns its budget does not
stop it answering the client's keepalives and acknowledgements, and the client keeps its session
through a stall. `--no-raknet-worker` runs it on the game thread instead.

Gameplay and dimension scenarios share one server and client; natural spawning uses a separate
server because it needs a cow spawn fixture that could affect gameplay checks. The runner resets
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

The runner prints the artifacts directory (screenshots, recordings, a combined server log, and a
server log per suite) and exits non-zero when any scenario fails. The root `pnpm run e2e:client`
command also collects V8 coverage from the server processes and writes an LCOV report to
`coverage/client-e2e/lcov.info`. Each server writes a coverage file every 10 seconds, and each
file repeats the server's whole source map cache, so a full run leaves about a hundred files of
about 35 MB each. `.c8rc.json` sets `merge-async`, so the report reads and merges them one at a
time rather than holding every one in memory at once.

In CI, `.github/workflows/client-e2e.yml` builds a matrix from every cinnabar pin of a BDS protocol
in `packages/bedrock-data/sources.json`, listed by `src/pin-matrix.mts`, and runs the full suite with the compatibility default (`zlib`)
on `ubuntu-latest` for each one, with the client rendering through Mesa's software Vulkan driver on
a virtual X display. The job runs as many suites at once as the runner's cores and memory allow. A second matrix runs the full suite with `snappy` and `none` across every
supported protocol, covering retail-client negotiation without duplicating the `zlib` jobs. Each
pin's job uploads evidence and an LCOV report to Codecov. A NetherNet pin's build and e2e jobs set
`continue-on-error`, so they report a failure without failing the run until NetherNet works end to
end in both the server and cinnabar. A preceding job builds each
pinned client that has no cached build. It restores cargo's compiled dependencies from the closest
earlier build, its own protocol's first and then any other, so a pin bump compiles only the crates
that changed, and it links with `mold`. Locally, source checkouts live
outside the repository at `$XDG_CACHE_HOME/jsprismarine/cinnabar/v<protocol>/<commit>/repo`, falling
back to `~/.cache/jsprismarine/cinnabar/v<protocol>/<commit>/repo`. Cargo and Go build outputs live in
one shared `$XDG_CACHE_HOME/jsprismarine/cinnabar/v<protocol>` directory per protocol, outside all
checkouts and worktrees. Cargo's final artifacts go in `target/`, and its intermediates go in
`build/`. Pins with different commits therefore reuse that protocol's build cache. A protocol with
neither directory starts from a copy of the closest protocol that has a finished build (a clone on
APFS, so it costs no extra disk). When `sccache` is
installed, Rust outputs are also reused across protocol caches and worktrees; on macOS, install it
with `brew install sccache`. Its local cache is shared at `<cache-root>/sccache` and is capped at
sccache's 10 GB default. Set
`JSP_CINNABAR_CACHE_DIR` to change the cache root, or set `JSP_CINNABAR_PATH` to use an existing
checkout directly. GitHub Actions saves the finished build the e2e jobs restore, one entry per
protocol and pin, outside its workspace. A build on `master` of the latest protocol also saves
cargo's intermediate directory, which only the next build reads. The runner also writes a pass/fail
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

`cinnabar.json` pins a cinnabar commit for each wire protocol in `commit`, the RakNet pin, and may
pin another in `nethernet.commit` for NetherNet runs. Bedrock 1.26.60 joins over NetherNet only,
so new protocols will carry a NetherNet pin, and a protocol may have it alone. The NetherNet pin
for 2225 is a cinnabar development commit rather than a release, because no release joins over
NetherNet reliably yet. A NetherNet pin's checkout and build cache are named `v<protocol>-nethernet`
instead of `v<protocol>`. `ensure` cross-checks the selected
pin's Bedrock target (`assets/bedrock-target.json` in the checkout) against the requested protocol
and the protocols this checkout serves. The matrix fails if a newly supported protocol has no
cinnabar pin. Point `JSP_CINNABAR_PATH` at an existing cinnabar checkout to skip the clone (offline,
or while testing a different client commit).

## Interactive driving

`.mcp.json` at the repository root registers the pinned `cinnabar-mcp` controller, so an agent
session can drive the client directly: launch, join a local server, send input, read `state`,
and capture screenshots or recordings. The [client-e2e skill](../../.agents/skills/client-e2e/SKILL.md)
holds the workflow and its rules.

## Adding a scenario

Add a file under `src/scenarios/` exporting a `Scenario` (see `src/scenario.mts`) and register it
in the compatible suite in `src/run.mts`. A scenario receives its suite's server (console commands, log
matching), its in-world client (input, state, captures), and an artifacts directory. Scenarios in
one suite run sequentially with a reset between them; separate suites can run concurrently, so keep
files inside the provided artifacts directory and avoid shared mutable state. Assert with
`node:assert/strict` and throw to fail; the runner joins the client before the first scenario.
