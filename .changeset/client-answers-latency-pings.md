---
'@jsprismarine/client': patch
---

The client now answers the server's `NetworkStackLatency` pings, echoing the time with Is From Server cleared. JSPrismarine sends them as its keep-alive and disconnects a client that leaves one unanswered, so a `Bot` used to be dropped after about 30 seconds.
