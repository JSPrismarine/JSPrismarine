---
'@jsprismarine/prismarine': patch
---

Verify the Minecraft services token and the client data signature before trusting a login when `online-mode` is on. The account now comes only from the signed token, a login that cannot be verified is refused, and an existing session is replaced only after the new login is accepted.
