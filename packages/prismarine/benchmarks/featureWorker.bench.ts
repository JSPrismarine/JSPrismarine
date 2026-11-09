/**
 * Compares the worker payload clone plus copied feature view with the read-through feature view.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:feature-worker [samples]`. The payloads
 * contain nine full-height terrain tiles, and each timed sample includes structured cloning the
 * worker input and constructing the corresponding view. It also counts center-chunk block reads
 * and the terrain-tile lookups they trigger. Digests are computed after timing.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';
import type { HeightmapType } from '@jsprismarine/features';

import { GenerationRegion } from '../src/world/generators/datadriven/GenerationRegion';
import type { GenerationRegionOptions } from '../src/world/generators/datadriven/GenerationRegion';
import { createJavaBlockOracle } from '../src/world/generators/datadriven/javaBlockOracle';
import { percentile } from './percentile';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const SAMPLES = Number.parseInt(argumentsAfterScript[0] ?? '7', 10);
const WARMUPS = 2;
const SEED = 1234n;
const MIN_Y = -64;
const HEIGHT = 384;
const HEIGHTMAP_TYPES = [
    'WORLD_SURFACE_WG',
    'WORLD_SURFACE',
    'OCEAN_FLOOR_WG',
    'OCEAN_FLOOR',
    'MOTION_BLOCKING',
    'MOTION_BLOCKING_NO_LEAVES'
] as const satisfies readonly HeightmapType[];

if (!Number.isSafeInteger(SAMPLES) || SAMPLES < 1) throw new RangeError('Samples must be a positive integer');

const oracle = createJavaBlockOracle(new Map());
const options: GenerationRegionOptions = {
    chunkX: 0,
    chunkZ: 0,
    minY: MIN_Y,
    height: HEIGHT,
    radius: 1,
    seaLevel: 63,
    seed: SEED,
    blocks: oracle,
    biomeAt: () => 'minecraft:plains'
};
const adoptedOptions = {
    minY: options.minY,
    height: options.height,
    seaLevel: options.seaLevel,
    seed: options.seed,
    blocks: options.blocks,
    biomeAt: options.biomeAt
};

/** Full-height, deterministic terrain similar to the height and state density of an overworld. */
const sourceTiles = Array.from({ length: 9 }, (_unused, index) => {
    const chunkX = Math.trunc(index / 3) - 1;
    const chunkZ = (index % 3) - 1;
    const tile = new GenerationRegion({ ...options, chunkX, chunkZ, radius: 0 });
    for (let localX = 0; localX < 16; localX++) {
        for (let localZ = 0; localZ < 16; localZ++) {
            const top = 58 + ((localX * 7 + localZ * 11 + index * 13) % 29);
            for (let y = MIN_Y; y <= top; y++) {
                tile.writeName(
                    chunkX * 16 + localX,
                    y,
                    chunkZ * 16 + localZ,
                    y === top ? 'minecraft:grass_block' : 'minecraft:stone'
                );
            }
        }
    }
    tile.freezeSurfaceHeights();
    return tile;
});
const workerPayloads = sourceTiles.map((tile) => tile.workerInput());

/** Reproduces the feature-worker structured-clone boundary. */
const workerCopies = (): GenerationRegion[] =>
    structuredClone(workerPayloads).map((payload) => GenerationRegion.adopt(payload, adoptedOptions));

const digestOf = (view: GenerationRegion): string => {
    const hash = createHash('sha256');
    for (let x = -16; x < 32; x++) {
        for (let z = -16; z < 32; z++) {
            for (let y = MIN_Y; y < MIN_Y + HEIGHT; y++) hash.update(`${view.stateAt(x, y, z).name}\0`);
        }
    }
    return hash.digest('hex');
};

/** Counts block reads for repeated heightmap lookups over one chunk's columns. */
const measureHeightmapReads = (view: GenerationRegion) => {
    let blockReads = 0;
    let firstPassBlockReads = 0;
    const originalBlockAt = view.blockAt.bind(view);
    view.blockAt = (x, y, z) => {
        blockReads++;
        return originalBlockAt(x, y, z);
    };

    const world = view.featureWorld();
    const started = performance.now();
    let queries = 0;
    for (let repeat = 0; repeat < 4; repeat++) {
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const x = localX;
                const z = localZ;
                for (const type of HEIGHTMAP_TYPES) {
                    world.getHeight(type, x, z);
                    queries++;
                }
            }
        }
        if (repeat === 0) firstPassBlockReads = blockReads;
    }
    const heightmapLookupMs = performance.now() - started;
    view.blockAt = originalBlockAt;
    return {
        queries,
        blockReads,
        uncachedBlockReads: firstPassBlockReads * 4,
        heightmapLookupMs
    };
};

/** Counts the terrain-tile lookups made by one chunk's full-height feature reads. */
const measureFeatureReads = (view: GenerationRegion) => {
    let featureReads = 0;
    let tileLookups = 0;
    const started = performance.now();
    for (let localX = 0; localX < 16; localX++) {
        for (let localZ = 0; localZ < 16; localZ++) {
            for (let y = MIN_Y; y < MIN_Y + HEIGHT; y++) {
                view.blockAt(localX, y, localZ);
                featureReads++;
                // This fixture has no sparse overlay, so each feature read reaches one source tile.
                tileLookups++;
            }
        }
    }
    return { featureReads, tileLookups, lookupMs: performance.now() - started };
};

interface Sample {
    readonly ms: number;
    readonly peakHeapDeltaBytes: number;
    readonly peakArrayBufferDeltaBytes: number;
    readonly outputDigest: string;
    readonly heightmapQueries: number;
    readonly heightmapBlockReads: number;
    readonly uncachedHeightmapBlockReads: number;
    readonly heightmapLookupMs: number;
    readonly featureReads: number;
    readonly terrainTileLookups: number;
    readonly featureReadLookupMs: number;
}

const sample = (readThrough: boolean): Sample => {
    const before = process.memoryUsage();
    const started = performance.now();
    const tiles = workerCopies();
    const peakAfterClone = process.memoryUsage();
    const view = readThrough
        ? GenerationRegion.featureView(options, tiles)
        : (() => {
              const copied = new GenerationRegion(options);
              for (const tile of tiles) copied.copyCenterFrom(tile);
              return copied;
          })();
    const peakAfterView = process.memoryUsage();
    const ms = performance.now() - started;
    const heightmapMeasurements = measureHeightmapReads(view);
    const featureReadMeasurements = measureFeatureReads(view);

    return {
        ms,
        peakHeapDeltaBytes: Math.max(peakAfterClone.heapUsed, peakAfterView.heapUsed) - before.heapUsed,
        peakArrayBufferDeltaBytes:
            Math.max(peakAfterClone.arrayBuffers, peakAfterView.arrayBuffers) - before.arrayBuffers,
        outputDigest: digestOf(view),
        heightmapQueries: heightmapMeasurements.queries,
        heightmapBlockReads: heightmapMeasurements.blockReads,
        uncachedHeightmapBlockReads: heightmapMeasurements.uncachedBlockReads,
        heightmapLookupMs: heightmapMeasurements.heightmapLookupMs,
        featureReads: featureReadMeasurements.featureReads,
        terrainTileLookups: featureReadMeasurements.tileLookups,
        featureReadLookupMs: featureReadMeasurements.lookupMs
    };
};

const summarize = (runs: readonly Sample[]) => {
    const sorted = runs.map(({ ms }) => ms).sort((left, right) => left - right);
    const heap = runs.map(({ peakHeapDeltaBytes }) => peakHeapDeltaBytes).sort((left, right) => left - right);
    const buffers = runs
        .map(({ peakArrayBufferDeltaBytes }) => peakArrayBufferDeltaBytes)
        .sort((left, right) => left - right);
    const heightmapBlockReads = runs.map(({ heightmapBlockReads }) => heightmapBlockReads).sort((a, b) => a - b);
    const uncachedHeightmapBlockReads = runs
        .map(({ uncachedHeightmapBlockReads }) => uncachedHeightmapBlockReads)
        .sort((a, b) => a - b);
    const heightmapLookupMs = runs.map(({ heightmapLookupMs }) => heightmapLookupMs).sort((a, b) => a - b);
    const featureReadLookupMs = runs.map(({ featureReadLookupMs }) => featureReadLookupMs).sort((a, b) => a - b);
    const digests = new Set(runs.map(({ outputDigest }) => outputDigest));
    return {
        distributionMs: {
            min: sorted[0] ?? 0,
            p50: percentile(sorted, 0.5),
            p95: percentile(sorted, 0.95),
            max: sorted.at(-1) ?? 0
        },
        peakHeapDeltaBytes: percentile(heap, 0.5),
        peakArrayBufferDeltaBytes: percentile(buffers, 0.5),
        heightmapQueries: runs[0]?.heightmapQueries ?? 0,
        heightmapBlockReads: percentile(heightmapBlockReads, 0.5),
        uncachedHeightmapBlockReads: percentile(uncachedHeightmapBlockReads, 0.5),
        heightmapLookupMs: percentile(heightmapLookupMs, 0.5),
        featureReads: runs[0]?.featureReads ?? 0,
        terrainTileLookups: runs[0]?.terrainTileLookups ?? 0,
        featureReadLookupMs: percentile(featureReadLookupMs, 0.5),
        outputDigest: digests.size === 1 ? runs[0]?.outputDigest : 'unstable'
    };
};

for (let warmup = 0; warmup < WARMUPS; warmup++) {
    sample(false);
    sample(true);
}

const copiedRuns: Sample[] = [];
const readThroughRuns: Sample[] = [];
for (let index = 0; index < SAMPLES; index++) {
    if (index % 2 === 0) {
        copiedRuns.push(sample(false));
        readThroughRuns.push(sample(true));
    } else {
        readThroughRuns.push(sample(true));
        copiedRuns.push(sample(false));
    }
}

const copied = summarize(copiedRuns);
const readThrough = summarize(readThroughRuns);
if (copied.outputDigest !== readThrough.outputDigest) throw new Error('Feature-view output digests differ');

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'feature-worker-clone-and-view',
        seed: Number(SEED),
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        workerCount: 0,
        samples: SAMPLES,
        warmups: WARMUPS,
        terrainTiles: workerPayloads.length,
        copiedView: copied,
        readThroughView: readThrough
    })}\n`
);
