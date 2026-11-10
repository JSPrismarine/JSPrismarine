---
"@jsprismarine/prismarine": minor
---

Run every command from one registry. `/tps`, `/version` (`/about`), `/debug`, `/ban` and `/pardon` now register into the same `@jsprismarine/commands` registry as the vanilla set, so `/help` lists them and the remote console completes every command name rather than these five alone. `/ban` and `/pardon` still complete a name from the players online and accept one who is offline.

Removed with the second dispatcher: the `Command` class, `CommandArguments`, the `Commands` namespace, `CommandManager.registerCommand`, `getCommand`, `getCommands`, `getCommandsList` and `getDispatcher`, the `commandRegister` event and `CommandRegisterEvent`, and `vanillaPermissionOf`, which is now `commandPermissionOf`. `asyncCommand` is gone; `deferCommandWork` and `collectAsyncCommands` move to `command/deferred`.
