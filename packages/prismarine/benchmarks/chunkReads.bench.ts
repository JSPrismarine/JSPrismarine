/**
 * Compares chunk and storage lookup arrays with the former Map lookup path.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:chunk-reads [reads]`.
 * The deterministic chunk fixture also reports its network digest and a full-section read digest.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import { maxY } from '../src/world/Dimension';
import type { DimensionType } from '../src/world/DimensionType';
import Chunk from '../src/world/chunk/Chunk';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const READS = Number.parseInt(argumentsAfterScript[0] ?? '500000', 10);
if (!Number.isSafeInteger(READS) || READS < 1) throw new RangeError('Reads must be a positive integer');

const chunk = new Chunk(0, 0);
const stone = BlockRuntimeIds.getByName('minecraft:stone');
const dirt = BlockRuntimeIds.getByName('minecraft:dirt');
const air = BlockRuntimeIds.getByName('minecraft:air');

for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
            chunk.setBlockRuntimeId(x, 64 + y, z, (x + y + z) % 7 === 0 ? dirt : stone);
        }
    }
}

const subChunk = chunk.getSubChunk(4);
if (subChunk === null) throw new Error('Chunk fixture has no sub chunk at y=4');
const storage = subChunk.getStorages()[0];
if (storage === undefined) throw new Error('Chunk fixture has no block storage at layer 0');

// This mirrors the two Map.get calls in the former Chunk and SubChunk read path.
class MapBackedSubChunk {
    private readonly storages = new Map([[0, storage]]);

    public getBlockRuntimeId(x: number, y: number, z: number, layer = 0): number {
        return this.storages.get(layer)?.getRuntimeId(x, y, z) ?? air;
    }
}

class MapBackedChunk {
    private readonly subChunks = new Map([[4, new MapBackedSubChunk()]]);

    public constructor(private readonly dimension: DimensionType) {}

    public getBlockRuntimeId(x: number, y: number, z: number, layer = 0): number {
        if (y < this.dimension.minY || y > maxY(this.dimension)) return air;
        const subChunk = this.subChunks.get(y >> 4) ?? null;
        if (!subChunk) return air;
        return subChunk.getBlockRuntimeId(x, y & 0xf, z, layer);
    }
}

const arrayReadAt = (x: number, y: number, z: number): number => chunk.getBlockRuntimeId(x, y, z);
const mapChunk = new MapBackedChunk(chunk.getDimension());
const mapReadAt = mapChunk.getBlockRuntimeId.bind(mapChunk);

const checksum = (readAt: (x: number, y: number, z: number) => number, reads: number): number => {
    let digest = 2166136261;
    for (let index = 0; index < reads; index++) {
        const x = index & 0xf;
        const y = 64 + ((index >>> 4) & 0xf);
        const z = (index >>> 8) & 0xf;
        digest = Math.imul(digest ^ readAt(x, y, z), 16777619) >>> 0;
    }
    return digest;
};

const scanDigest = (readAt: (x: number, y: number, z: number) => number): number => {
    let digest = 2166136261;
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            for (let y = 64; y < 80; y++) {
                digest = Math.imul(digest ^ readAt(x, y, z), 16777619) >>> 0;
            }
        }
    }
    return digest;
};

const measure = (readAt: (x: number, y: number, z: number) => number) => {
    const samples = Array.from({ length: 7 }, () => {
        const started = performance.now();
        const digest = checksum(readAt, READS);
        return { ms: performance.now() - started, digest };
    });
    const times = samples.map(({ ms }) => ms).sort((left, right) => left - right);
    const digests = new Set(samples.map(({ digest }) => digest));
    if (digests.size !== 1) throw new Error('Lookup digest changed between samples');

    return {
        p50NsPerRead: ((times[3] ?? 0) * 1_000_000) / READS,
        p95NsPerRead: ((times[6] ?? 0) * 1_000_000) / READS,
        digest: samples[0]?.digest.toString(16).padStart(8, '0')
    };
};

const mapDigest = checksum(mapReadAt, READS);
const arrayDigest = checksum(arrayReadAt, READS);
if (mapDigest !== arrayDigest) throw new Error('Map and chunk lookup paths returned different block digests');

const mapScanDigest = scanDigest(mapReadAt);
const arrayScanDigest = scanDigest(arrayReadAt);
if (mapScanDigest !== arrayScanDigest) throw new Error('Map and chunk scan paths returned different light digests');

console.log(
    JSON.stringify({
        benchmark: 'chunk-reads',
        seed: 0,
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        reads: READS,
        mapLookups: measure(mapReadAt),
        arrayLookups: measure(arrayReadAt),
        chunkDigest: createHash('sha256').update(chunk.networkSerialize()).digest('hex'),
        lightReadDigest: arrayScanDigest.toString(16).padStart(8, '0')
    })
);
