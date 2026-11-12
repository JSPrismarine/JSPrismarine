---
'@jsprismarine/client': patch
---

The client signs its NetherNet offer with its login's identity key whatever it logs in as. An offline client used to sign with a throwaway key, and Bedrock Dedicated Server 1.26.60 refused its login with `NotAuthenticated`, since that server accepts a login only on a connection whose offer the login's key signed. `netherNetIdentityOf` now always returns an identity.
