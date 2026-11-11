---
'@jsprismarine/client-e2e': patch
---

The harness runs NetherNet's UDP four ways with `--udp-ports`: `shared` with RakNet on the server port, the default; a `single` other port; a `range`; and a `range-with-server-port`. `--public-ip` sets `server-public-ip`. A `kick` scenario checks that a kicked client is shown the reason.
