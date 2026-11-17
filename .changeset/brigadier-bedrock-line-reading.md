---
'@jsprismarine/brigadier': patch
---

`CommandDispatcher` takes an optional second argument with two options for reading a line as Bedrock does. `spaceRuns` reads any run of spaces between two arguments as one separator, and `farthestFailure` makes the error for a refused line point at the first word no route could read. Without them the dispatcher behaves as before.
