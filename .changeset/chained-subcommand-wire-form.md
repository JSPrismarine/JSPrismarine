---
'@jsprismarine/commands': patch
---

Write chained subcommands the way a Bedrock Dedicated Server does. Each value pair in `buildAvailableCommands`'s `chainedSubcommands` now names the keyword's enum in `second` instead of repeating `first`, and a chained parameter's parse symbol is `Chained | Valid | index` instead of an enum's. `ParameterTypeFlag.Chained` and `chainedParseSymbol` build that word.
