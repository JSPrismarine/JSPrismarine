---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
---

Cut background generation only for stalls that more generation would make worse. `ConcurrencyGovernor` counts a stall once rather than once per tick the ticker runs to catch up, and with the new optional `utilization` signal and `busyUtilization` option (0.8 by default) it ignores a late tick while the server thread has mostly been waiting. The server passes the event loop's utilization over the last one to two seconds. The control group throttle signal is unchanged.
