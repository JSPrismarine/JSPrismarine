---
'@jsprismarine/client': patch
---

A login that fails while its auth provider is still signing no longer keeps `ClientSession.settled()` waiting on that provider, and the provider's late answer sends no `Login` or handshake reply.
