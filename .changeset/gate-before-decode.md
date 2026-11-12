---
'@jsprismarine/prismarine': patch
---

The network dispatcher checks a packet's handler and the connection's phase before it decodes the packet's body. A packet nothing handles in the current phase, such as a clientbound packet a peer sends to the server, is now dropped without being parsed.
