---
'@jsprismarine/errors': patch
'@jsprismarine/script-host': patch
---

`@jsprismarine/script-host` throws errors from a new `script-host` catalog in `@jsprismarine/errors`, each with a code and a page in the error reference. Messages are unchanged. Import `ScriptError`, `ScriptTerminatedError`, `ScriptOutOfMemoryError`, `NativeLibraryError`, `DebuggerConnectionError`, `DebuggerFramingError` and `DebuggerTransportError` from `@jsprismarine/errors/script-host`; `ScriptError` keeps `scriptName`, `scriptMessage` and `scriptStack`. `NotImplementedError` and `ScriptApiError` stay in `@jsprismarine/script-host/errors`, and `DebuggerMessages` is gone, since the catalog now holds those messages. Errors that code inside the engine throws to a script remain the engine's own `TypeError`, `RangeError` and `ReferenceError`, as on Bedrock Dedicated Server.
