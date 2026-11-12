---
'@jsprismarine/native-network': patch
---

The library logs warnings and worse unless a load asks for another level, and a line logged during a call goes to the queue of the thread that made it. `NativeNetwork.flushLog` hands queued log lines to the log handler at once and defers the other events to the next turn of the event loop, so a failed call can read what it logged.
