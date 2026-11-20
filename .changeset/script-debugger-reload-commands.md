---
'@jsprismarine/prismarine': patch
---

The VS Code script debugger stays attached across `/reload`: the extension sees the scripts' thread exit and start again, and its breakpoints still stop the reloaded scripts. The extension's command box runs a command between ticks and prints `Executing command [...]` and any error to the content log and the debug console, as Bedrock Dedicated Server does. An attached extension gets an entity count each tick and the script engine's memory every tenth tick for its diagnostics panel, and the session ends with `terminated` when `/script debugger close` closes it.
