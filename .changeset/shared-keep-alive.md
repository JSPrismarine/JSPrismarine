---
'@jsprismarine/prismarine': minor
---

The server now checks that a client of either edition is still there with one keep-alive. It pings a Java client with `Keep Alive` and a Bedrock client with `NetworkStackLatency`, as Geyser does. A client that leaves a ping unanswered until the next one is due is disconnected with "Timed out". The new `keep-alive-interval` setting sets the seconds between pings, 15 by default as on a vanilla Java server, and 0 turns the pings off. `packet-compression-threshold` now sets the Java threshold as well as the Bedrock one.
