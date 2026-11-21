---
'@jsprismarine/auth': patch
---

`createClientData` now sends `UIProfile` and `MaxViewDistance`, as a retail client does. Pumpkin refused a login without them, so `@jsprismarine/client` could not join a Pumpkin server. `MaxViewDistance` defaults to 32 and takes a `maxViewDistance` option.
