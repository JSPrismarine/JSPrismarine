---
'@jsprismarine/script-host': patch
---

`ScriptDebugSession` now speaks the rest of the VS Code debugger protocol as Bedrock Dedicated Server does on the wire. A passed handshake sends a `SchemaEvent` with BDS's diagnostics tabs, `stats` sends a tick's `StatEvent2`, and `detach` sends `terminated` instead of `ThreadEvent` `exited`. `detachEngine` keeps the session open across a reload: the next `attach` sends `ThreadEvent` `new` and sets the breakpoints again without waiting for the extension. `startProfiler` and `stopProfiler` record the debugged pack's stack at each debugger poll and send it back as a `.cpuprofile` in a `ProfilerCapture`.
