---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Word a command line's syntax error the way the Bedrock Dedicated Server does, `Syntax error: Unexpected "nonsense": at "/time set >>nonsense<<"`, in chat and at the console, instead of Brigadier's message. `@jsprismarine/commands/syntaxError` exports `bedrockSyntaxError`, which builds that message from a `CommandSyntaxException`. `/time set` now refuses a word that names no time of day as a syntax error.
