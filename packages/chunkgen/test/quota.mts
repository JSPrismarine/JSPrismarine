/**
 * Tick lateness and control group throttling with background generation saturating a CPU quota,
 * governor off and on. Linux only: it reads `/sys/fs/cgroup`.
 *
 * Run from `packages/chunkgen` in a container with a quota and the package installed:
 *
 *     docker run --rm --cpus=2 -v "$PWD":/w -w /w node:26-bookworm-slim \
 *         node --import tsx test/quota.mts off|on
 *
 * The tick is simulated by a 50 ms loop that spends 5 ms of work, so the figures are lateness of
 * that loop. Compare the two arms on the same host, back to back.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CgroupThrottleSampler, ConcurrencyGovernor, parseCpuMax } from '../src/ConcurrencyGovernor.ts';
import { HostedGenerationPool } from '../src/HostedGenerationPool.ts';

const governed = process.argv[2] === 'on';
const WORKERS = 4;
const pool = new HostedGenerationPool({
    pipeline: fileURLToPath(new URL('./fakePipeline.mjs', import.meta.url)),
    workers: WORKERS,
    setup: { spinMs: 40 }
});
await pool.run({ status: 'terrain', chunkX: -1, chunkZ: 0, dimension: 0 });

const sampler = new CgroupThrottleSampler();
const governor = new ConcurrencyGovernor({ max: WORKERS - 1 });
let throttledTotal = 0;
sampler.sample();

// Keep the background backlog full.
let done = 0;
let x = 0;
const feed = () => {
    while (pool.queued + pool.inFlight < WORKERS * 3) {
        void pool.run({ status: 'terrain', chunkX: x++, chunkZ: 0, dimension: 0 }, 'idle').then(
            () => done++,
            () => {}
        );
    }
};

const late: number[] = [];
let due = performance.now() + 50;
let lastSample = 0;
let sampledDelta = 0;
const end = performance.now() + 15_000;
const busy = (ms: number) => {
    const until = performance.now() + ms;
    while (performance.now() < until);
};
if (governed) pool.setBackgroundLimit(governor.active);
while (performance.now() < end) {
    const wait = due - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const lateness = Math.max(0, performance.now() - due);
    late.push(lateness);
    busy(5); // the tick's own work
    due += 50;
    feed();
    const now = performance.now();
    sampledDelta = 0;
    if (now - lastSample >= 1000) {
        lastSample = now;
        sampledDelta = sampler.sample() ?? 0;
        throttledTotal += sampledDelta;
    }
    if (governed) {
        const limit = governor.observe({ latenessMs: lateness, throttledDelta: sampledDelta }, now);
        pool.setBackgroundLimit(limit);
    }
}
late.sort((a, b) => a - b);
const p = (f: number) => late[Math.min(late.length - 1, Math.ceil(f * late.length) - 1)]!.toFixed(1);
const max = parseCpuMax(readFileSync('/sys/fs/cgroup/cpu.max', 'utf8'));
console.log(
    JSON.stringify({
        governor: governed ? 'on' : 'off',
        cpuMax: max,
        samplerAvailable: sampler.available,
        ticks: late.length,
        latenessMs: { p50: p(0.5), p99: p(0.99), max: late.at(-1)!.toFixed(1) },
        throttledPeriods: throttledTotal,
        backgroundTasksDone: done,
        finalLimit: governed ? governor.active : null
    })
);
await pool.destroy();
process.exit(0);
