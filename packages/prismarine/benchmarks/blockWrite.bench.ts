/**
 * Measures block-write redstone scans, world reads, and CPU time with and without a hook filter.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/blockWrite.bench.ts`.
 */
import os from 'node:os';

import { createEngine, createTestWorld } from '@jsprismarine/engine-systems';
import type { WorldAccess } from '@jsprismarine/engine-systems';

const WRITES = 1000;
const SAMPLES = 5;
type Mode = 'no-bridge' | 'bridge-no-hook' | 'bridge-with-hook';

const sample = (mode: Mode): { readonly ms: number; readonly reads: number; readonly updates: number } => {
    const base = createTestWorld();
    let reads = 0;
    const world: WorldAccess = {
        ...base,
        getBlock(at) {
            reads++;
            return base.getBlock(at);
        }
    };
    let updates = 0;
    const engine = createEngine(
        world,
        mode === 'no-bridge'
            ? {}
            : {
                  shouldComputeRedstoneUpdate: () => mode === 'bridge-with-hook',
                  onRedstoneUpdate: () => updates++
              }
    );

    const started = performance.now();
    for (let index = 0; index < WRITES; index++) {
        engine.setBlockAndUpdate({ x: index * 4, y: 0, z: 0 }, { name: 'minecraft:stone', states: {} });
    }
    return { ms: performance.now() - started, reads, updates };
};

for (const mode of ['no-bridge', 'bridge-no-hook', 'bridge-with-hook'] as const) {
    const runs = Array.from({ length: SAMPLES }, () => sample(mode)).sort((left, right) => left.ms - right.ms);
    const median = runs[Math.floor(runs.length / 2)]!;
    console.log(
        JSON.stringify({
            benchmark: 'block-write-redstone',
            mode,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            writesPerSample: WRITES,
            medianMs: median.ms,
            readsPerWrite: median.reads / WRITES,
            updatesPerWrite: median.updates / WRITES
        })
    );
}
