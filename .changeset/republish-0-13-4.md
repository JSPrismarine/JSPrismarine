---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/brigadier': patch
'@jsprismarine/client': patch
'@jsprismarine/color-parser': patch
'@jsprismarine/errors': patch
'@jsprismarine/logger': patch
'@jsprismarine/math': patch
'@jsprismarine/minecraft': patch
'@jsprismarine/nbt': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/raknet': patch
'@jsprismarine/server': patch
---

Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.
