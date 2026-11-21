---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Check the permission node of every command a line reaches, not only the one typed: a command nested in `/execute ... run` or run from a function is gated on the node and level of the player who typed the line, so holding `minecraft.command.execute` no longer stands in for the node of the command it runs. `CommandRegistryOptions` gains `canUse`, the gate the dispatcher asks by command name wherever it parses a command's root literal or alias, and `CommandSource.caller` is set only for a player who typed the line, never defaulted from the entity a script or a function runs as.
