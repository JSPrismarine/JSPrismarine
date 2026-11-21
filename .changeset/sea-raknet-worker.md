---
'@jsprismarine/raknet': patch
'@jsprismarine/errors': patch
---

The Node single executable from `pnpm run package` embeds RakNet's socket worker and loads it from its asset, so the executable can listen for players.
