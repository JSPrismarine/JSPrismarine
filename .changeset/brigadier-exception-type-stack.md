---
'@jsprismarine/brigadier': patch
---

`SimpleCommandExceptionType` and `DynamicCommandExceptionType` no longer record a stack trace when they are constructed. They are not errors, and nothing read that stack. The `CommandSyntaxException` they create is unchanged: it keeps its message, and it records a stack only when `CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES` is on, which it is not by default.
