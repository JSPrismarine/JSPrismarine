---
'@jsprismarine/prismarine': minor
---

Remove the `Anvil` world provider. It never read or wrote a chunk: every read generated fresh terrain and every write was dropped, so a world configured with it lost everything on restart. A config that still names `Anvil` now stops the server with an error listing the providers that exist. Java world support will come back as a real reader and writer.
