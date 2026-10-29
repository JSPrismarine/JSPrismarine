---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/client': patch
---

`pnpm run bringup --protocol <n>` is the first command of a protocol bring-up: it verifies the
version is pinned in `sources.json` and `packages/minecraft/datagen/manifest.json` (and says
exactly what to pin when it is not), boots the pinned Bedrock Dedicated Server through the same
staging and runner machinery as `dump:bedrock`, and walks the capture client's full login against
it. `packages/client/tools/bringup-probe.mjs` reports each stage — network settings, login,
resource packs, start game, spawn — as pass or fail, and on a failure prints the undecodable
packet ids with the reader's offset and the last raw packets, which is what a developer iterates
on while implementing a new version's delta codec. The exit status is the probe's: 0 means our
client spawned on the real server, which exercises both wire directions of every join-path
packet. The runner selection `run.ts` always did now lives in `launcherForHost` in `runner.ts`,
shared by both entry points. `.agents/skills/protocol-bringup/SKILL.md` places the tool inside
the whole bring-up workflow.
