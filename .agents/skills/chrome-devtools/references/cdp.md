# Direct CDP debugging

Use [the skill's `cdp.mjs` CLI](../cdp.mjs) for every connection and request. Pass the stable URL
printed after `JSPrismarine inspector:`. Keep `connect` mode open across inspection calls so it can
receive events and send follow-up commands. The host relay keeps that WebSocket connected when
watch mode replaces the server child. If the host itself exits, start a new CLI connection with its
new printed URL.

Send one JSON object per stdin line. For example, enable the debugger and runtime, then evaluate an
expression:

```json
{"method":"Debugger.enable","params":{}}
{"method":"Runtime.enable","params":{}}
{"method":"Runtime.evaluate","params":{"expression":"jsprismarine.server.getTick()","returnByValue":true}}
```

The CLI assigns numeric request IDs and prints every response and event as JSON lines. Use `call`
mode only for one request that will not pause execution or require event handling. Read the current
[V8 Debugger protocol](https://chromedevtools.github.io/devtools-protocol/v8/Debugger/) when an
operation's parameters are unclear.

In `connect` mode, add a `saveTo` file path to a request when its result is an artifact. The CLI
removes this field before sending the CDP request. For `Profiler.stop`, it writes the returned
profile; for `HeapProfiler.takeHeapSnapshot`, it joins the snapshot chunks and writes the
`.heapsnapshot` file. `call` mode accepts `--output <file>` for single-request results.

## Connection and execution

Send `Runtime.enable` and `Debugger.enable` through `connect` mode. For `Debugger.scriptParsed`,
read events as they arrive and retain script IDs, URLs, and source-map URLs. For `--devtools-wait`,
set breakpoints before `Runtime.runIfWaitingForDebugger`. The inspector is reachable during this
wait, even though server initialization and the live handle are not ready. Send
`Runtime.runIfWaitingForDebugger` again after each watched child restart.

Watch for the `Debugger.paused` event before triggering the reproduction. A `Runtime.evaluate`
request that hits a breakpoint remains pending while paused. Keep the CLI session open, inspect
the pause event, send `Debugger.resume` as a separate request, and then read the original
evaluation response. Waiting synchronously for that response before sending resume deadlocks the
debugger workflow.

## Breakpoints and scopes

- For a known script URL, use `Debugger.setBreakpointByUrl` with `url` or `urlRegex`,
  zero-based `lineNumber`, and optional `condition`. Check returned locations or wait for
  `Debugger.breakpointResolved`; an unresolved breakpoint is not proof of coverage.
- For a loaded script ID, use `Debugger.getScriptSource` and `Debugger.getPossibleBreakpoints`
  to choose an executable location, then `Debugger.setBreakpoint`. Raw CDP locations address
  generated JavaScript. Map the TypeScript location to generated JavaScript before sending the
  request. A `.ts` script URL alone does not prove that line numbers match the source.
- For a live function, use `Runtime.evaluate` to retrieve its remote `objectId`, then
  `Debugger.setBreakpointOnFunctionCall`. Keep the remote object alive until installation.
- For script instrumentation, use `Debugger.setInstrumentationBreakpoint` with
  `instrumentation: 'beforeScriptExecution'` or `'beforeScriptWithSourceMapExecution'`.
  Install it before the script runs. Remove it once the relevant script is captured to avoid
  repeatedly pausing unrelated scripts.
- For exceptions, use `Debugger.setPauseOnExceptions` with `state: 'all'` or `'uncaught'`.
  Reset it to `'none'` during cleanup.
- On `Debugger.paused`, retain `callFrames`, `hitBreakpoints`, and `reason`. Evaluate local
  expressions with `Debugger.evaluateOnCallFrame` using the frame's `callFrameId`; inspect
  each `scopeChain` object's properties with `Runtime.getProperties`. Use
  `Debugger.setVariableValue` only when state mutation is part of the authorized experiment.
- Use `Debugger.stepInto`, `Debugger.stepOver`, or `Debugger.stepOut`, and wait for the next
  `Debugger.paused` event. Use `Debugger.setAsyncCallStackDepth` when following asynchronous
  callers. Frame IDs become invalid after resume. Remove installed breakpoints with
  `Debugger.removeBreakpoint`, and send `Debugger.resume` before disconnecting.

## Profiles and artifacts

Use `Profiler.enable`, `Profiler.start`, and `Profiler.stop` through the CLI for CPU sampling. Add
`"saveTo":"jsp/profiles/server.cpuprofile"` to the `Profiler.stop` request to save the profile.
Use `HeapProfiler.startSampling` and `HeapProfiler.stopSampling` for allocation samples after
`HeapProfiler.enable`.

For `HeapProfiler.takeHeapSnapshot`, add
`"saveTo":"jsp/profiles/server.heapsnapshot"` to the request. The CLI collects every
`HeapProfiler.addHeapSnapshotChunk` notification in order until the command completes. Write large
artifacts to disk and show only relevant summaries in chat. Release temporary remote object groups
with `Runtime.releaseObjectGroup` after inspection.
