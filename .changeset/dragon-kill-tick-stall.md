---
'@jsprismarine/prismarine': patch
---

Killing the ender dragon between ticks, such as with a console `/kill`, no longer stops the server ticking. The fight now runs the death's consequences in its next tick, so the gateway chunk it loads is admitted inside that tick instead of waiting for an input step that could not come. A tick that stalls with chunk completions held for the next input step now admits them and logs a `TickStalledError` that names them, instead of hanging without a log line.
