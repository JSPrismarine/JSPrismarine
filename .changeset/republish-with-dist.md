---
'@jsprismarine/bedrock-data': minor
'@jsprismarine/brigadier': minor
'@jsprismarine/client': minor
'@jsprismarine/color-parser': minor
'@jsprismarine/errors': minor
'@jsprismarine/logger': minor
'@jsprismarine/math': minor
'@jsprismarine/minecraft': minor
'@jsprismarine/nbt': minor
'@jsprismarine/prismarine': minor
'@jsprismarine/protocol': minor
'@jsprismarine/raknet': minor
'@jsprismarine/server': minor
---

Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.
