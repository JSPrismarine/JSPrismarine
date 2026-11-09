---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
---

Chunk generation can run in a separate process. `chunkgen` gains `GenerationTransport`, the surface both pools share, `HostedGenerationPool`, which forks a generation host at a lowered operating system priority and replaces it if it dies, and `createGenerationTransport`, which falls back to threads in the server process when no host can start. The new `chunk-host` option in `config.json` takes `process` or `in-process`. It defaults to `in-process`, so nothing changes until it is set. Generated chunks are byte-identical either way.
