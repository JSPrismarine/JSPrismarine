/** A stand-in server for the host lifetime test: starts a host, prints its pid, then waits. */
import { fileURLToPath } from 'node:url';

import { HostedGenerationPool } from '../src/HostedGenerationPool.ts';

const pool = new HostedGenerationPool({
    pipeline: fileURLToPath(new URL('./fakePipeline.mjs', import.meta.url)),
    workers: 1
});
await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
process.stdout.write(`host ${pool.hostPid}\n`);
setInterval(() => {}, 1000);
