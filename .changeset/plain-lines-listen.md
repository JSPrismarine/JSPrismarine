---
"@jsprismarine/prismarine": minor
---

Turn `Console` into a plain line console: it reads one command per stdin line, writes log records as stdout lines, and no longer puts the terminal in raw mode or redraws a prompt. `writeAbovePrompt` and the `PromptWriter` type are removed from `@jsprismarine/prismarine/Console`; the interactive terminal UI now lives in `@jsprismarine/console`. Adds a server-owned console sender and `RemoteConsole`, which runs commands and streams logs and status to a host process over IPC.
