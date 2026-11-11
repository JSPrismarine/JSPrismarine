---
"@jsprismarine/prismarine": minor
---

`CommandRequestHandler`, `SettingsCommandHandler` and `TextHandler` take the narrow handler context in place of the `Server` and the session. Each checks its packet synchronously in the input step and defers the command or the chat line, with `CommandRequestHandler`'s `CommandOutputPacket` reply, to run once the handler has returned. The order of effects is unchanged.
