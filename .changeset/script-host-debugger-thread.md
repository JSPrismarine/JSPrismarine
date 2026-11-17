---
'@jsprismarine/script-host': patch
---

`DebuggerThread` (`@jsprismarine/script-host/debugger/thread`) runs the debugger's listener and connection on a worker thread and hands each connection to the starting thread as a channel endpoint, with an event after every message, so the world's thread still has its socket read while a script is stopped. `ScriptDebugSession.offer` sends the protocol event without waiting for the answer, `DebuggerSocket.peer` names the extension's address and port, and `WorldScripts`' `onPackLoaded` option names each pack once its context is ready and before its first line runs.
