---
'@jsprismarine/client': patch
---

The client can join servers over NetherNet, the WebRTC transport Bedrock Dedicated Server defaults to: pass `network: 'nethernet'` to `Client`. It joins by address the way the game does, probing `GET /v1/join`, posting a signed offer and checking the identity on the server's answer, then carries batches over the data channel. RakNet stays the default.
