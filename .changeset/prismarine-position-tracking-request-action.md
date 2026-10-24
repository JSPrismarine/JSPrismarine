---
'@jsprismarine/prismarine': patch
---

`PositionTrackingDBClientRequestHandler` drops a request whose `Action` is not `Query`, the only action the docs list, with a debug log line instead of reading it as a query.
