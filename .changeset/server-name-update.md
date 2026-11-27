---
'@jsprismarine/raknet': patch
---

`ServerName.update(fields)` changes the MOTD, the server name and the two player counts at once, so a listener such as the worker's pong cache hears of them in one snapshot rather than one per field. A field left out keeps its value, and an update that changes nothing is not announced. `ServerNameFields` names what it takes.
