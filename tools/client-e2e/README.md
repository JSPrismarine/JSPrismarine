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
# Clone and build the pinned client (slow once, then a no-op), and verify the
# protocol it speaks is one this checkout serves.
pnpm --filter @jsprismarine/client-e2e run ensure

# Run every scenario, or a selection. --record captures the run as an MP4.
pnpm run e2e:client
pnpm run e2e:client movement chat
pnpm run e2e:client -- --record --artifacts /tmp/evidence
```

The runner prints the artifacts directory (screenshots, recordings, the full server log) and
exits non-zero when the join or any scenario fails. The root `pnpm run e2e:client` command also
collects V8 coverage from the server process and writes an LCOV report to
`coverage/client-e2e/lcov.info`.

In CI, `.github/workflows/client-e2e.yml` runs the suite on macOS (the one hosted platform where
the client's renderer is proven) for pull requests that touch the wire or gameplay packages, and
uploads the artifacts as evidence and the LCOV report to Codecov. The cinnabar build is cached on
the pin, so only the first run after a pin change pays for the compile. On GitHub Actions the
runner also writes a pass/fail table to the job summary.

## Version pin

`cinnabar.json` pins the client commit. `ensure` cross-checks the pin's Bedrock target
(`assets/bedrock-target.json` in the checkout) against the wire protocols this checkout serves
(`packages/bedrock-data/sources.json`), and fails with instructions when they diverge. Point
`JSP_CINNABAR_PATH` at an existing cinnabar checkout to skip the clone (offline, or while
testing a different client commit).

## Interactive driving

`.mcp.json` at the repository root registers the pinned `cinnabar-mcp` controller, so an agent
session can drive the client directly: launch, join a local server, send input, read `state`,
and capture screenshots or recordings. The [client-e2e skill](../../.agents/skills/client-e2e/SKILL.md)
holds the workflow and its rules.

## Adding a scenario

Add a file under `src/scenarios/` exporting a `Scenario` (see `src/scenario.mts`) and register it
in the `scenarios` list in `src/run.mts`. A scenario receives the live server (console commands,
log matching), the in-world client (input, state, captures), and an artifacts directory. Assert
with `node:assert/strict` and throw to fail. The runner has already joined the world by the time
a scenario runs.
