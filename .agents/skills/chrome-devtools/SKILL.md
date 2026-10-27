---
name: chrome-devtools
description: Debug and profile JSPrismarine through Chrome DevTools Protocol with the skill's cdp.mjs CLI. Use whenever diagnosing runtime failures, inspecting live server state, setting breakpoints or stepping through execution, debugging startup, profiling CPU or memory, or investigating slow ticks and performance regressions. Apply alongside diagnosing-bugs for runtime diagnosis.
---

# Chrome DevTools

Use the server's `--devtools` integration as the default runtime debugger and profiler. Send all
live DevTools Protocol commands through [`cdp.mjs`](cdp.mjs). Do not open the DevTools frontend,
drive a browser, or use browser automation to connect to this server's inspector.
Read [Live debugging and profiling](../../../docs/running.md#live-debugging-and-profiling) for
startup flags and trace artifacts. Use this skill's CLI route for inspector access. Keep the
diagnosis loop in [diagnosing-bugs](../diagnosing-bugs/SKILL.md);
this skill supplies its runtime inspection and measurement tools. Build, lint, and type errors
can use their own command output without starting a server.

## Connect to the server

Reuse an existing development server with DevTools enabled when it matches the reproduction.
Otherwise, start from the repository root:

```bash
pnpm run dev -- --devtools
```

For an agent-controlled plain console, append `--no-tui` to that command. Preserve the
reproduction's world, seed, configuration, and workload. Use a disposable world when the
reproduction changes persistent state.

For configuration or server-initialization failures, use startup waiting instead:

```bash
pnpm run dev -- --devtools-wait --no-tui
```

`--devtools-wait` enables DevTools by itself and blocks before configuration and server
construction. Static module imports have already run. The live `jsprismarine` handle becomes
available only after construction. Enable the debugger and install startup breakpoints before
sending `Runtime.runIfWaitingForDebugger`. Every watch restart waits again.

Wait for the host's `JSPrismarine inspector:` line and pass its stable WebSocket URL to the CLI.
Do not use a child's `JSPrismarine inspector target:` URL. The host relay keeps the URL stable
across watch restarts and reconnects to each replacement process. Keep the CLI connected while
debugging so it can receive events and send follow-up commands after a pause.

From the repository root, start a persistent CDP session:

```bash
node .agents/skills/chrome-devtools/cdp.mjs connect --url "$INSPECTOR_URL"
```

Send one JSON CDP request per stdin line. The CLI assigns request IDs and writes responses and
events as JSON lines to stdout. Use `call` for a single request that does not need event handling:

```bash
node .agents/skills/chrome-devtools/cdp.mjs call --url "$INSPECTOR_URL" Runtime.evaluate '{"expression":"jsprismarine.server.getTick()","returnByValue":true}'
```

The CLI uses Node's built-in WebSocket API and needs no package install. Read
[Direct CDP debugging](references/cdp.md) for request flow, debugger pause handling, breakpoints,
and profiling. Never claim a session or capture succeeded without observing its response or event.

## Inspect the reproduction

Use breakpoints, exception pauses, call stacks, and scoped evaluation to test a specific
hypothesis. Resume execution after collecting the evidence. A paused server stops ticking;
exclude pauses from performance measurements and account for client timeouts.

Use normal or conditional source breakpoints for a known location, function-call breakpoints
for a live method, and exception pauses for failures. For script instrumentation, use
`Debugger.setInstrumentationBreakpoint` with `beforeScriptExecution` or
`beforeScriptWithSourceMapExecution`. These are V8 script hooks. DOM, XHR, and browser
event-listener breakpoints do not apply to JSPrismarine. Read the CDP reference for generated
JavaScript locations, source-map handling, stepping, and paused scope inspection.

Inspect live objects with `Runtime.evaluate` through the CLI. For example, send this request in a
persistent session:

```json
{"method":"Runtime.evaluate","params":{"expression":"jsprismarine.server.getTick()","returnByValue":true}}
```

Discover the actual world names and dimensions before targeting them. These are live objects;
prefer bounded, read-only queries, and treat method calls that change state as part of the
reproduction. Avoid dumping whole registries or adding temporary logging when a CLI inspection can
answer the question.

## Profile the workload

Capture a baseline before changing code. Record the scenario, warmup, capture duration, and
relevant load so the same workload can be measured after the change.

- Use `Profiler.enable`, `Profiler.start`, and `Profiler.stop` through the CLI to attribute sampled
  CPU time to functions and call stacks. Save the returned profile as JSON in a `.cpuprofile` file.
- Use `HeapProfiler` commands through the CLI for heap snapshots or allocation profiling. Account
  for snapshot pauses and compare equivalent workload and garbage-collection conditions.
- Use the built-in timing trace to locate slow server ticks, world phases, and event-loop delay.
  Stop the server gracefully and wait for `JSPrismarine trace saved to` before collecting the
  `.trace.json` file. The default development location is `jsp/profiles/`; `JSP_DIR` can change
  it.

Timing spans include awaited work and are not CPU samples. The trace keeps a bounded window
of recent events, so reproduce near capture end. A forced exit cannot save it. Stop recording
and resume paused execution before graceful shutdown; wait for the save message rather than
sending repeated termination signals.

After an authorized fix, repeat the same workload and compare the relevant measurements.
Report the observed cause with its source location, the before/after evidence, artifact paths,
and any capture or reproduction limitations. Remove temporary probes and breakpoints, and
stop only sessions started for this task.
