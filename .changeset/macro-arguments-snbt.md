---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': minor
---

A function macro's arguments are read with `@jsprismarine/nbt`'s SNBT reader, and each entry substitutes as Java's `MacroFunction` prints it: a float or a double through Java's `DecimalFormat` with at most 15 fraction digits (`1.0d` as `1`, `0.5d` as `.5`), and a typed array or an escaped string as it reads. The server's own macro argument parser is gone, and with it `SnbtSyntaxError` and the five `PrismarineCommandErrors.Snbt*` entries.
