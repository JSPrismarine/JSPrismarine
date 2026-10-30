---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/server': patch
---

Run the chunk generation pool inside the Bun-compiled executables.

A compiled binary refused the worker pool outright, so every published executable generated
terrain on the server thread. Bun does run workers in a compiled binary when their entry
modules are passed as extra compile entrypoints, so the build now embeds the generation worker
and both pipeline modules beside the server and tells the pool where they landed through
`JSP_EMBEDDED_*` defines, the same mechanism as the build metadata. The pool refuses only a
binary compiled without them, which is what Node's single executable still is. Bun names an
embedded entrypoint by its path relative to the entrypoints' common directory, which is
observed behavior rather than documented, so the build verifies the names it compiled in and
fails loudly if a Bun release changes the scheme.
