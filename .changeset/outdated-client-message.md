---
'@jsprismarine/prismarine': patch
---

Tell a client on the wrong protocol version why it was refused (#1586).

The version check happens on the first packet a client sends, before login, and a mismatch used to end in a disconnect with the reason hidden. The player saw "Disconnected from Server" and nothing else. The server now sends the client the same failed play status the login step would have, which the client shows as "Outdated client" or "Outdated server", and the disconnect that follows names the version to use. The refusal is also logged with both protocol numbers.
