---
'@jsprismarine/chunkgen': patch
'@jsprismarine/raknet': patch
'@jsprismarine/leveldb': patch
'@jsprismarine/server': patch
---

The Bun-compiled executables no longer exit on start. The generation pool, the RakNet socket and LevelDB's table builder each start a worker the compile did not embed: the pool handed its worker to piscina, whose own `dist/worker.js` was a path on the build machine, and the other two looked for their worker beside a bundled module that is not there. The executable now embeds all three, the generation pool runs a compiled binary's worker through its own runner as the Node single executable does, and the release and nightly builds start each executable and stop it again before publishing it.
