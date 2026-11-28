---
'@jsprismarine/prismarine': patch
'@jsprismarine/client': patch
'@jsprismarine/bedrock-data': patch
'@jsprismarine/errors': patch
---

Five exchanges, such as opening a chest and dying, are checked at each Bedrock protocol against that protocol's own pinned Bedrock Dedicated Server. `dump:bedrock --pass exchanges --protocol <n>` drives the client through the exchange scenarios in `@jsprismarine/client/exchanges/scenarios` against that protocol's server and writes what it sent under `src/jsp/v<n>/exchanges/`, captured here for protocols 2193, 2225 and 2259. The captures changed the server in two places: a death screen sends `DeathInfo` before `Respawn`, and a client's first window opens as 2, as every pinned server does. The client decodes `DeathInfo`, `ClientPacketRegistry.decodesNamed` says whether a packet class reaches the client's listeners, and a loopback join can speak another protocol.
