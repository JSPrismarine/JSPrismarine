# Direct CDP debugging

Use an external Node process or persistent Node REPL to connect to the printed
`JSPrismarine inspector:` URL. Keep the connection alive across inspection calls. Read
the current [V8 Debugger protocol](https://chromedevtools.github.io/devtools-protocol/v8/Debugger/)
when an operation's parameters are unclear.

## Connection and execution

Create a Node `WebSocket` and wait for `open`. Send JSON objects with unique numeric `id`,
`method`, and `params` fields. Install the message listener before sending commands. Match
responses by `id`; retain notifications by `method`. Reject CDP error responses, and bound
command and event waits with a timeout that names the operation. On socket closure, reject
pending operations and reconnect to the current endpoint if the watcher restarted the server.

Send `Runtime.enable` and `Debugger.enable`. Register `Debugger.scriptParsed` handling before
enabling the debugger to retain script IDs, URLs, and source-map URLs. For `--devtools-wait`,
set breakpoints before `Runtime.runIfWaitingForDebugger`. The inspector is reachable during
this wait, even though server initialization and the live handle are not ready.

Register the `Debugger.paused` waiter before triggering the reproduction. A `Runtime.evaluate`
request that hits a breakpoint remains pending while paused. Keep its promise, inspect the
pause, resume through a separate command, and then await the original evaluation. Awaiting
the evaluation first deadlocks the controller until its timeout.

## Breakpoints and scopes

- For a known script URL, use `Debugger.setBreakpointByUrl` with `url` or `urlRegex`,
  zero-based `lineNumber`, and optional `condition`. Check returned locations or wait for
  `Debugger.breakpointResolved`; an unresolved breakpoint is not proof of coverage.
- For a loaded script ID, use `Debugger.getScriptSource` and `Debugger.getPossibleBreakpoints`
  to choose an executable location, then `Debugger.setBreakpoint`. Raw CDP locations address
  generated JavaScript. Use a source-map-aware frontend or map the TypeScript location before
  sending it. A `.ts` script URL alone does not prove that line numbers match the source.
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

Use `Profiler.enable`, `Profiler.start`, and `Profiler.stop` for CPU sampling. Save the returned
`profile` as JSON in a `.cpuprofile` file. Use `HeapProfiler.startSampling` and
`HeapProfiler.stopSampling` for allocation samples after `HeapProfiler.enable`.

For `HeapProfiler.takeHeapSnapshot`, collect every `HeapProfiler.addHeapSnapshotChunk`
notification in order until the command completes, then concatenate the chunks into a
`.heapsnapshot` file. Register the chunk listener before starting capture. Write large artifacts
to disk and show only relevant summaries in chat. Release temporary remote object groups with
`Runtime.releaseObjectGroup` after inspection.
