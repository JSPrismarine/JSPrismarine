---
'@jsprismarine/prismarine': patch
'@jsprismarine/bedrock-data': patch
---

A checkout without the Bedrock vanilla behavior pack no longer runs silently without mobs. `pnpm dev` now downloads the pack when the cache lacks it, and the server logs a warning that names the consequence when the pack is missing. Before, a fresh clone or git worktree started with one entity type: nothing spawned, `/summon` answered "Unable to summon entity" for every type, and the End had no ender dragon.
