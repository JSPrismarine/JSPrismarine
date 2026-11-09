---
title: Log Levels
description: What each log level prints and how to choose one.
group: Documents
category: Types
---

# Log levels

-   `error` Critical errors (eg error was thrown)
-   `warn` Non-critical errors (eg unimplemented packet)
-   `info` General information (eg chat output)
-   `verbose` Extra information (eg timings)
-   `debug` Debug information (eg each command ids registered)
-   `silly` Verbose debug information (eg every packet sent/received)

Before formatting an expensive message, call `logger.isEnabled(level)`. The check uses the same level threshold as the matching log method and returns `false` after the logger is disabled.
