---
name: client-e2e
description: Verify client-visible behavior end to end by driving the cinnabar Bedrock client against a local JSPrismarine server. Use when validating or reproducing what a real client sees (joins, movement, chat, rendering), when running client e2e scenarios, or when capturing gameplay screenshots or recordings as evidence.
---

# Client e2e verification

`tools/client-e2e` drives [cinnabar](https://github.com/cinnabar-mc/cinnabar), a real rendering
Bedrock client, against a JSPrismarine server built from this checkout. Use it to prove behavior
a protocol-level test cannot see: what a third-party client actually simulates and renders. For
protocol bring-up pass/fail staging, `packages/client/tools/bringup-probe.mjs` stays the tool.

One-time setup (slow first build, then a no-op; needs cargo, go, make, and the network):

```bash
pnpm --filter @jsprismarine/client-e2e run ensure
```

`ensure` fails when the pinned client's wire protocol is not one this checkout serves; follow its
message rather than forcing a join.

## Scripted scenarios

```bash
pnpm run e2e:client                      # every scenario
pnpm run e2e:client movement            # a selection
pnpm run e2e:client -- --record         # also record the run as MP4
```

The runner boots a scratch flat-world server with `online-mode` off, joins it headlessly, runs
each scenario, and prints an artifacts directory with screenshots, recordings, and the server
log. Exit 0 means the join and every scenario passed. When a change alters client-visible
behavior, add a scenario for it: see "Adding a scenario" in
[`tools/client-e2e/README.md`](../../../tools/client-e2e/README.md).

CI runs the same suite on macOS through `.github/workflows/client-e2e.yml` for pull requests
touching the wire or gameplay packages, with the cinnabar build cached on the pin and the
artifacts uploaded as `client-e2e-evidence`. A red Client E2E check means a real client failed
against the PR's server; read the job summary table and the uploaded artifacts first.

## Driving the client interactively

The `cinnabar` MCP server in `.mcp.json` exposes `launch_client`, `connect`, `input`, `chat`,
`state`, `wait_for`, `screenshot`, `record_start`/`record_stop`, `camera_path`, and `quit`. The
tool schemas document every argument. Boot a server to join either with the harness
(`startServer` in `tools/client-e2e/src/jsp-server.mts`) or `pnpm run dev`; the harness server
accepts console commands on stdin, and a dev server through its terminal.

Launch policy, every time:

- `launch_client` with `headless: true`, an isolated absolute `CINNABAR_USER_ROOT` in `env`
  (a scratch directory, so no real account or saved state leaks in), and
  `args: ["--display-name", "<offline name>"]`. Drive the client only through these tools;
  OS-level input or window automation is off-limits.
- `connect` with `address: "127.0.0.1:<port>"`. The controller only accepts loopback; never pass
  `allow_remote` without the repository owner's explicit go-ahead, since remote joins use the
  configured account.
- After `connect`, `wait_for` `"in_world"`, then `{"chunks_loaded": {"radius": 2}}` before
  reading positions or capturing.

Assert on `state`: `in_world`, `feet`/`eye`/`server_position` (3-vectors), `rotation`, `health`,
`dimension`, `chunks.loaded_columns`, `player_motion` (simulation tick, velocity, jump and sprint
state), `hud.title`/`subtitle`, and `screens`. Pointer input uses logical window pixels; captures
are physical pixels.

## Captures

- `screenshot` saves a PNG and also returns it inline for your own eyes; pass `inline: false`
  when you only need the file.
- `record_start` needs `ffmpeg` on PATH and `fixed_clock: false` against any JSPrismarine server;
  the fixed clock is only for cinnabar's bundled showcase server. `record_stop` reports
  `dropped_frames`; rerun a capture that dropped many.
- Write captures to the runner's artifacts directory or a temporary directory outside the
  checkout. Recordings and screenshots stay out of git. For attaching them to a pull request,
  use the [pr-recordings](../pr-recordings/SKILL.md) skill.

## Teardown

`quit` the client (it also stops any local server the controller started) and stop the scratch
JSPrismarine server (`stop` on its console). A wedged client process is safe to kill; its state
lives in the scratch user root.
