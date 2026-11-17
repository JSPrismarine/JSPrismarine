---
'@jsprismarine/server': patch
---

`--watch`, which `pnpm run dev` passes, now runs `/reload` when a loaded behavior pack's script changes, so the scripts start over while the world keeps running. A change to pack data still restarts the server.
