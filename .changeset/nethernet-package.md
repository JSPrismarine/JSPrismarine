---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

New package `@jsprismarine/nethernet` holds the NetherNet pieces a server and a client share: HTTP signaling, the signed `a=identity` on SDP answers, the LAN advertisement codec and the ES384 JSON Web Signatures Bedrock uses. `@jsprismarine/prismarine` uses it for its NetherNet transport and its encryption handshake.
