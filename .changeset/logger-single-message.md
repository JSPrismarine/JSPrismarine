---
'@jsprismarine/logger': minor
'@jsprismarine/raknet': minor
'@jsprismarine/client': minor
'@jsprismarine/prismarine': minor
---

`Logger.info`, `warn`, `verbose`, `debug` and `silly` take one message rather than `...message: string[]`, and RakNet's structural `Logger` type does the same. Many call sites still passed a second argument that was once a namespace, which the logger joined onto the text, so a line read `Stopping server, interrupt again to exit immediately Server/kill.`; those arguments are gone, and the compiler now refuses a new one. Join the parts yourself if you passed several. `configureSocketBuffers` drops its `context` parameter, which only fed those namespaces, and its error lines now say the size they asked for.
