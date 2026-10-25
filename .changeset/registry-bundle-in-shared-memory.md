---
'@jsprismarine/prismarine': patch
---

Pack the Java world generation registries into one buffer so several threads can share the bytes.

`buildRegistryBundle` writes the 1514 documents as a header, an index of
`(registry, id, offset, length)` and the documents' UTF-8 JSON end to end;
`readRegistryBundle` reads either an `ArrayBuffer` or the `SharedArrayBuffer` that
`shareRegistryBundle` returns, and does not care which. Measured here: 3.11 MiB, 9.1 ms to
build, 21.6 ms to read back, against 112 ms for the loader to walk the files with the page cache
warm and the 430 to 573 ms a cold worker spends doing it for itself.

Nothing above the parse is shareable, so a worker still rebuilds the density graph, the noise
tables and the biome source out of these documents. What this removes is the part that is pure
I/O and would otherwise be paid once per worker, and it avoids `workerData`, whose structured
clone runs on the spawning thread.

Production still reads the files. This lands the format and its round trip ahead of the worker
pool that uses it.
