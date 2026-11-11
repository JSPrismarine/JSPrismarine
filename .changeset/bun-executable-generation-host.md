---
'@jsprismarine/chunkgen': patch
'@jsprismarine/server': patch
---

The Bun-compiled executable now runs chunk generation in a separate generation host process at a lowered operating system priority, as a server run from source does. It starts itself again with the hidden `--role generation-host`. A Bun-compiled build of your own opts in by defining `JSP_EMBEDDED_GENERATION_HOST` and handing that role to `@jsprismarine/chunkgen/generationHost`. Node single executables still generate in the server process.
