---
'@jsprismarine/brigadier': patch
---

Export `BoolArgumentType`, `FloatArgumentType`, `IntegerArgumentType`, `StringArgumentType` and the `StringType` enum alongside their factory functions, so code that reads a command tree can tell the built-in argument types apart with `instanceof` and `getType()`.
