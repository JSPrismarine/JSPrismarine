/**
 * Benchmarks draining 2,000 due ticks from queues with different pending sizes.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/engine-systems/benchmarks/ticklist.bench.ts`.
 */
import os from 'node:os';

import { TickList } from '../src/scheduler';

const DUE_TICKS = 2000;
const QUEUE_SIZES = [2500, 6000, 25000];
const SAMPLES = 7;

const drainSample = (pendingTicks: number): number => {
    const list = new TickList();
    for (let index = 0; index < pendingTicks; index++) {
        list.schedule({ x: index, y: 0, z: 0 }, 'minecraft:water', index < DUE_TICKS ? 1 : 2);
    }

    const started = performance.now();
    const drained = list.tick(1, () => undefined);
    const elapsedMs = performance.now() - started;
    if (drained !== DUE_TICKS) throw new Error(`Expected ${DUE_TICKS} due ticks, drained ${drained}`);
    return elapsedMs;
};

for (const pendingTicks of QUEUE_SIZES) {
    for (let warmup = 0; warmup < 3; warmup++) drainSample(pendingTicks);
    const samples = Array.from({ length: SAMPLES }, () => drainSample(pendingTicks)).sort(
        (left, right) => left - right
    );

    console.log(
        JSON.stringify({
            benchmark: 'ticklist-drain',
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            pendingTicks,
            dueTicks: DUE_TICKS,
            samplesMs: samples,
            medianMs: samples[Math.floor(samples.length / 2)]
        })
    );
}
