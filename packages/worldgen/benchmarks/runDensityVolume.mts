import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { rolldown } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), 'jsp-density-volume-bench-'));

try {
    const bundle = await rolldown({
        input: path.join(here, 'densityVolume.ts'),
        platform: 'node'
    });
    const entry = path.join(work, 'densityVolume.mjs');
    await bundle.write({ file: entry, format: 'esm', codeSplitting: false });
    await bundle.close();

    const runWorker = async (task: string): Promise<unknown> => {
        const worker = new Worker(entry, { workerData: task });
        const [result] = await once(worker, 'message');
        const [exitCode] = await once(worker, 'exit');
        if (exitCode !== 0) throw new Error(`Density volume benchmark worker exited with code ${String(exitCode)}`);
        return result;
    };

    const comparison = await runWorker('compare');
    const scalarWorkerMemory = await runWorker('memory:scalar');
    const volumeWorkerMemory = await runWorker('memory:volume');
    process.stdout.write(`${JSON.stringify({ comparison, scalarWorkerMemory, volumeWorkerMemory }, null, 2)}\n`);
} finally {
    rmSync(work, { recursive: true, force: true });
}
