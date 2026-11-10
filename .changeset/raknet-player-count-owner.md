---
'@jsprismarine/raknet': patch
'@jsprismarine/prismarine': patch
---

`ServerName.ownPlayerCount()` hands the advertised player count to whoever owns the server name: the RakNet sockets then report their sessions through `ServerName.setSessionCount`, which no longer changes the count. JSPrismarine takes the count over, so a RakNet socket no longer briefly overwrites a count that includes NetherNet players with its own session count.
