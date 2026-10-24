---
'@jsprismarine/prismarine': patch
---

`ActorEventHandler` accepts only the events a vanilla client sends (`FEED`) and only about the sender's own player, then relays them to the players tracking it. Events naming another actor or a server-only event are dropped.
