---
'@jsprismarine/prismarine': patch
---

A sub chunk request from a client with its blob cache on is answered as Bedrock answers it: the hash of the section's terrain, with the section's block entities as the payload, and the terrain itself only in `ClientCacheMissResponse` when the client reports a miss. An all-air section in such an answer carries neither payload nor hash. The server used to send the whole section inline beside its hash, and the hash with no payload once the client had confirmed it, which a retail client left on with a bad packet error (`ClientDisconnection-90`) after walking into new chunks.
