/**
 * Seeded path searches over mixed terrain: `pnpm bench`.
 *
 * Reports searches found, block reads through the view, heap allocated and CPU per search, and a
 * digest of every path, so a change to the search can show what it cost and that it found the same
 * routes. A profile of this run puts about half the time in the cell reader (`enterable`, `cost`
 * and the view reads under them) and about five percent in the heap and node bookkeeping.
 */
import { createHash } from 'node:crypto';

import { findPath } from '../src/navigation/pathfinder';
import type { PathRequest } from '../src/navigation/pathfinder';
import { navigationProfileOf } from '../src/navigation/profile';
import type { NavigationView } from '../src/navigation/view';
import { voxelGrid } from '../src/navigation/voxelGrid';

const SIZE = 48;
const SEARCHES = 600;

const lcg = (seed: number) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
};

const random = lcg(2801);
const characters = ['.', '.', '.', '.', '#', '~'];
const layers = [
    Array.from({ length: SIZE }, () => '#'.repeat(SIZE)),
    ...Array.from({ length: 3 }, () =>
        Array.from({ length: SIZE }, () =>
            Array.from({ length: SIZE }, () => characters[Math.floor(random() * characters.length)]!).join('')
        )
    )
];
const profile = navigationProfileOf({ height: 2, canSwim: true });
const requests: PathRequest[] = Array.from({ length: SEARCHES }, () => ({
    from: { x: Math.floor(random() * SIZE), y: 1, z: Math.floor(random() * SIZE) },
    to: { x: Math.floor(random() * SIZE), y: 1, z: Math.floor(random() * SIZE) },
    maxNodes: 512,
    allowPartial: true
}));

const measure = (name: string, search: typeof findPath): void => {
    let blockReads = 0;
    const base = voxelGrid(layers);
    const view: NavigationView = { ...base, isSolid: (at) => (blockReads++, base.isSolid(at)) };
    const digest = createHash('sha256');

    for (let warmup = 0; warmup < 2; warmup++) for (const request of requests) search(view, profile, request);
    blockReads = 0;
    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    let found = 0;
    for (const request of requests) {
        const path = search(view, profile, request);
        if (path !== undefined) found += 1;
        digest.update(JSON.stringify(path?.nodes ?? null));
    }
    const cpu = process.cpuUsage(cpuBefore);
    const heap = process.memoryUsage().heapUsed - heapBefore;

    console.log(
        `${name.padEnd(10)} searches=${SEARCHES} found=${found} isSolid reads=${blockReads} ` +
            `cpu=${((cpu.user + cpu.system) / SEARCHES).toFixed(1)}us/search ` +
            `heap+=${(heap / 1024).toFixed(0)}KiB digest=${digest.digest('hex').slice(0, 12)}`
    );
};

measure('findPath', findPath);
