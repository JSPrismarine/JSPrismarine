import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

import { scriptHostAvailable } from './testing/library.test.helper';
import type { EngineWorkerReport } from './testing/engineWorker';

/** Node.js strips the worker's types; the repository's resolver adds its extensionless imports. */
const loader = new URL('../../../scripts/native-typescript-loader.mjs', import.meta.url).href;

const runWorker = (iterations: number): Promise<EngineWorkerReport> =>
    new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./testing/engineWorker.ts', import.meta.url), {
            workerData: iterations,
            execArgv: ['--import', loader]
        });
        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', (code) => {
            if (code !== 0) reject(new Error(`The engine worker exited with ${code}`));
        });
    });

describe.skipIf(!scriptHostAvailable())('engines on worker threads', () => {
    it('runs two engines on two threads at once, each calling its own host', async () => {
        const [first, second] = await Promise.all([runWorker(20_000), runWorker(30_000)]);

        // Each sums i % 10 squared: 285 for every ten iterations.
        expect(first).toEqual({ sum: 570_000, hostCalls: 20_000, terminatedAtStep: 51 });
        expect(second).toEqual({ sum: 855_000, hostCalls: 30_000, terminatedAtStep: 51 });
    });
});
