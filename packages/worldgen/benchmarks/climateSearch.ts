import { PerformanceObserver, performance } from 'node:perf_hooks';

import biomeVectors from '../vectors/biome-points.json' with { type: 'json' };
import { ClimateParameterList } from '../src/biome/Climate';
import type { ClimateEntry, ClimateTargetPoint } from '../src/biome/Climate';

const overworld = biomeVectors.parameterLists.find((list) => list.name === 'minecraft:overworld');
if (overworld === undefined) throw new Error('Biome vectors have no overworld parameter list');

const entries: ClimateEntry<string>[] = overworld.points.map((row, index) => {
    const values = row.split(' ').map(Number);
    const at = (offset: number): number => values[offset] ?? 0;
    const span = (offset: number) => ({ min: at(offset), max: at(offset + 1) });
    return {
        point: {
            temperature: span(1),
            humidity: span(3),
            continentalness: span(5),
            erosion: span(7),
            depth: span(9),
            weirdness: span(11),
            offset: at(13)
        },
        value: `${index}`
    };
});
const parameters = new ClimateParameterList(entries);
const garbageCollections: number[] = [];
const observer = new PerformanceObserver((records) => {
    for (const record of records.getEntries()) garbageCollections.push(record.duration);
});
observer.observe({ entryTypes: ['gc'] });

const hashText = (hash: number, value: string): number => {
    let current = hash;
    for (let index = 0; index < value.length; index++) {
        current = Math.imul(current ^ (value.charCodeAt(index) ?? 0), 16_777_619) >>> 0;
    }
    return Math.imul(current ^ 0xff, 16_777_619) >>> 0;
};

const targetForQueries = (seed: number): (() => ClimateTargetPoint) => {
    let random = seed;
    const target = { temperature: 0, humidity: 0, continentalness: 0, erosion: 0, depth: 0, weirdness: 0 };
    const next = (): number => {
        random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
        return (random % 40_001) - 20_000;
    };
    return () => {
        target.temperature = next();
        target.humidity = next();
        target.continentalness = next();
        target.erosion = next();
        target.depth = next();
        target.weirdness = next();
        return target;
    };
};

interface Measurement {
    readonly queries: number;
    readonly milliseconds: number;
    readonly digest: string;
    readonly gcEvents: number;
    readonly heapDelta: number;
}

const measure = async (
    queries: number,
    find: (target: ClimateTargetPoint) => string,
    seed: number
): Promise<Measurement> => {
    let best: Measurement | undefined;
    for (let repetition = 0; repetition < 4; repetition++) {
        global.gc?.();
        await new Promise<void>((resolve) => setImmediate(resolve));
        const gcBefore = garbageCollections.length;
        const heapBefore = process.memoryUsage().heapUsed;
        const nextTarget = targetForQueries(seed);
        let digest = 2_166_136_261;
        const started = performance.now();
        for (let query = 0; query < queries; query++) {
            digest = hashText(digest, find(nextTarget()));
        }
        const milliseconds = performance.now() - started;
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (repetition === 0) continue;

        const sample: Measurement = {
            queries,
            milliseconds,
            digest: digest.toString(16).padStart(8, '0'),
            gcEvents: garbageCollections.length - gcBefore,
            heapDelta: process.memoryUsage().heapUsed - heapBefore
        };
        if (best === undefined || sample.milliseconds < best.milliseconds) best = sample;
    }
    if (best === undefined) throw new Error('Climate search benchmark completed no measured repetitions');
    return best;
};

const indexed = await measure(200_000, (target) => parameters.find(target), 0x37a4_19d3);
const bruteForceQueries = 2_000;
const bruteForce = await measure(bruteForceQueries, (target) => parameters.findBruteForce(target), 0x37a4_19d3);
observer.disconnect();

process.stdout.write(`climate entries: ${entries.length}\n`);
process.stdout.write(
    `typed-array tree: ${indexed.queries} queries, ${indexed.milliseconds.toFixed(2)} ms ` +
        `(${((indexed.milliseconds * 1_000_000) / indexed.queries).toFixed(1)} ns/query), ` +
        `0 search-path object/array allocations, ${indexed.gcEvents} GC events, ` +
        `${indexed.heapDelta} B heap delta, digest ${indexed.digest}\n`
);
process.stdout.write(
    `brute-force scan: ${bruteForce.queries} queries, ${bruteForce.milliseconds.toFixed(2)} ms ` +
        `(${((bruteForce.milliseconds * 1_000_000) / bruteForce.queries).toFixed(1)} ns/query), ` +
        `${bruteForce.gcEvents} GC events, ${bruteForce.heapDelta} B heap delta, digest ${bruteForce.digest}\n`
);
