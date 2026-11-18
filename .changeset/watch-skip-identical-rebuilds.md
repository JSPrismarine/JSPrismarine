---
'@jsprismarine/server': patch
---

Under `--watch` with built output, restart the server only when a rebuilt file's bytes change. `pnpm dev` restarted the server twice after start-up: once when each package's `vite build --watch` rewrote its output on its first pass, and again when bedrock-data's full build finished, though neither changed a byte.
