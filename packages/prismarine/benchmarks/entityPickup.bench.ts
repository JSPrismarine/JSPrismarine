/**
 * Benchmarks many mobs searching a world with many dropped item stacks.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:items [items] [mobs] [samples]`. It
 * compares the former whole-world scan with the entity index's item query, including exact
 * three-dimensional filtering, nearest-first ordering, stable ties, and an output digest.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';

import type { ContentPosition } from '../src/content/world/adapter';
import type { DataEntity } from '../src/entity/data/DataEntity';
import { ITEM_ENTITY } from '../src/entity/data/droppedItems';
import { EntityIndex } from '../src/entity/data/entityIndex';
import type { ContentItemEntity } from '../src/entity/data/host';
import { stub } from '../src/testing/stub.test.helper';
import { percentile } from './percentile';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ITEM_COUNT = Number.parseInt(argumentsAfterScript[0] ?? '10000', 10);
const MOB_COUNT = Number.parseInt(argumentsAfterScript[1] ?? '400', 10);
const SAMPLES = Number.parseInt(argumentsAfterScript[2] ?? '7', 10);
const WARMUPS = 2;
const SEED = 1234;
const RADIUS = 16;

for (const [name, value] of [
    ['items', ITEM_COUNT],
    ['mobs', MOB_COUNT],
    ['samples', SAMPLES]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

const itemDetails = new Map<number, ContentItemEntity>();
const itemEntities: DataEntity[] = [];
for (let id = 0; id < ITEM_COUNT; id++) {
    const x = ((id * 97) % 1024) - 512 + 0.5;
    const z = ((id * 193) % 1024) - 512 + 0.5;
    const y = 64 + ((id % 11) - 5) * 0.25;
    // A dropped stack of the store as the index files one: its id, its type and where it stands.
    const entity = stub<DataEntity>({ id: id + 1, identifier: ITEM_ENTITY, position: { x, y, z } });
    itemEntities.push(entity);
    itemDetails.set(id + 1, {
        id: id + 1,
        position: { x, y, z },
        item: { identifier: 'minecraft:wheat', count: 1 }
    });
}

const index = new EntityIndex();
for (const entity of itemEntities) index.add(entity);
const allItems = [...itemDetails.values()];
const mobs: ContentPosition[] = Array.from({ length: MOB_COUNT }, (_unused, index) => ({
    x: ((index * 229) % 1024) - 512 + 0.5,
    y: 64 + ((index % 7) - 3) * 0.25,
    z: ((index * 401) % 1024) - 512 + 0.5
}));

interface Sample {
    readonly ms: number;
    readonly scannedItems: number;
    readonly pickupCandidates: number;
    readonly selectedItems: number;
    readonly outputDigest: string;
}

const run = (indexed: boolean): Sample => {
    const hash = createHash('sha256');
    let scannedItems = 0;
    let pickupCandidates = 0;
    let selectedItems = 0;
    const started = performance.now();

    for (const center of mobs) {
        const candidates: ContentItemEntity[] = [];
        if (indexed) {
            for (const entity of index.itemsWithin(center.x, center.z, RADIUS)) {
                const item = itemDetails.get(entity.id);
                if (item !== undefined) candidates.push(item);
            }
            pickupCandidates += candidates.length;
        } else {
            candidates.push(...allItems);
            scannedItems += candidates.length;
        }

        const nearby = candidates
            .map((item, order) => ({
                item,
                order,
                distance: Math.hypot(center.x - item.position.x, center.y - item.position.y, center.z - item.position.z)
            }))
            .filter(({ distance }) => distance <= RADIUS)
            .sort((left, right) => left.distance - right.distance || left.order - right.order);
        selectedItems += nearby.length;
        for (const { item } of nearby) hash.update(`${item.id},`);
        hash.update(';');
    }

    return {
        ms: performance.now() - started,
        scannedItems,
        pickupCandidates,
        selectedItems,
        outputDigest: hash.digest('hex')
    };
};

const summarize = (runs: readonly Sample[]) => {
    const sorted = runs.map(({ ms }) => ms).sort((left, right) => left - right);
    const digests = new Set(runs.map(({ outputDigest }) => outputDigest));
    return {
        distributionMs: {
            min: sorted[0] ?? 0,
            p50: percentile(sorted, 0.5),
            p95: percentile(sorted, 0.95),
            max: sorted.at(-1) ?? 0
        },
        scannedItems: runs[0]?.scannedItems ?? 0,
        pickupCandidates: runs[0]?.pickupCandidates ?? 0,
        selectedItems: runs[0]?.selectedItems ?? 0,
        outputDigest: digests.size === 1 ? runs[0]?.outputDigest : 'unstable'
    };
};

for (let warmup = 0; warmup < WARMUPS; warmup++) {
    run(false);
    run(true);
}

const fullScanRuns: Sample[] = [];
const indexedRuns: Sample[] = [];
for (let sample = 0; sample < SAMPLES; sample++) {
    if (sample % 2 === 0) {
        fullScanRuns.push(run(false));
        indexedRuns.push(run(true));
    } else {
        indexedRuns.push(run(true));
        fullScanRuns.push(run(false));
    }
}

const fullScan = summarize(fullScanRuns);
const indexed = summarize(indexedRuns);
if (fullScan.outputDigest !== indexed.outputDigest) throw new Error('Pickup query output digests differ');

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'dropped-item-pickup-search',
        seed: SEED,
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        workerCount: 0,
        itemCount: ITEM_COUNT,
        mobCount: MOB_COUNT,
        radius: RADIUS,
        samples: SAMPLES,
        warmups: WARMUPS,
        fullScan,
        indexed
    })}\n`
);
