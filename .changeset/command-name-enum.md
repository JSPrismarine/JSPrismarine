---
'@jsprismarine/commands': patch
---

`buildAvailableCommands` lists every command name and alias in the `CommandName` enum and names each alias enum after its command, such as `teleportCommandAliases`, as a Bedrock Dedicated Server does. A Bedrock client offers a namespaced command, such as `jsp:tpsbar`, in autocomplete only when `CommandName` lists it. `@jsprismarine/commands/flatten` exports `COMMAND_NAME_ENUM`, `aliasEnumName` and `commandNames`.
