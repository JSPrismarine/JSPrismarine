---
'@jsprismarine/prismarine': patch
---

The new `server-udp-ports` setting, as in Bedrock Dedicated Server, confines the UDP ports NetherNet players connect through to a range such as `49152-49200`, and advertises `[ip:]external:internal` mappings in the join answer so a server behind NAT reaches players from outside. Empty, the default, lets the system pick the ports. A malformed value stops the server from starting.
