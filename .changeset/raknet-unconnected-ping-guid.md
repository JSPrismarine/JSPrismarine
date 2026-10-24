---
'@jsprismarine/raknet': patch
---

`UnconnectedPing` now carries the client guid RakNet writes after the offline magic. `ClientSocket.ping` sends its own guid there, and decoding reads it when present (`clientGUID`, 0 for a ping that stops after the magic).
