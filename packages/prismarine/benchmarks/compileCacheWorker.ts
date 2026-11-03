/** Starts one TypeScript generation worker for the compile-cache and CPU-profiler smoke run. */
import { GenerationPool } from '@jsprismarine/chunkgen';
import { fileURLToPath } from 'node:url';

const pool = new GenerationPool({
    pipeline: fileURLToPath(new URL('./compileCacheWorkerPipeline.ts', import.meta.url)),
    workers: 1
});
const startedAt = performance.now();
try {
    const result = await pool.run({ status: 'empty', chunkX: 1, chunkZ: 2, dimension: 0 });
    if (result.payload !== '1,2') throw new Error(`Unexpected worker result: ${String(result.payload)}`);
    process.stdout.write(
        `${JSON.stringify({ workerStarted: pool.workers === 1, startupMs: performance.now() - startedAt })}\n`
    );
} finally {
    await pool.destroy();
}
