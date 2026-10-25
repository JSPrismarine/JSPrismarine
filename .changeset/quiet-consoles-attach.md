---
"@jsprismarine/logger": patch
---

Cap the console replay buffer at 1000 records (configurable with `capacity`) so a long boot without an attached console no longer grows memory without bound. A dropped backlog is announced with one line before the kept records are replayed.

Export the level order as `LOG_LEVELS`, with `isLogLevel` and `isAtLeastLevel`, so other packages derive level checks from the logger instead of copying the table.
