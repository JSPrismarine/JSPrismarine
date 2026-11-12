---
'@jsprismarine/client': patch
---

`conditionLink` takes a `sockets` filter. Sockets it leaves out send directly, draw no loss pick and are not counted, so a test can watch its own sockets while others in the process send.
