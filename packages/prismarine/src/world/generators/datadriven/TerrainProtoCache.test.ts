import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { GenerationRegionPayload } from './GenerationRegion';
import {
    canonicalWorldgenInput,
    fingerprintWorldgenInput,
    TerrainProtoCache,
    terrainProtoCacheKey
} from './TerrainProtoCache';

const directories: string[] = [];

afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const directory = (): string => {
    const created = mkdtempSync(join(tmpdir(), 'jsp-terrain-proto-cache-'));
    directories.push(created);
    return created;
};

const payload = (chunkX: number, chunkZ: number): GenerationRegionPayload => ({
    chunkX,
    chunkZ,
    minY: -64,
    height: 384,
    radius: 0,
    palette: [{ java: { name: 'minecraft:air', properties: {} } }],
    states: new ArrayBuffer(16 * 16 * 384 * Uint16Array.BYTES_PER_ELEMENT),
    highest: new ArrayBuffer(16 * 16 * Int32Array.BYTES_PER_ELEMENT),
    blockEntities: [],
    entitySpawns: []
});

const identity = (chunkX: number, chunkZ: number) => ({ chunkX, chunkZ, minY: -64, height: 384 });

const key = (chunkX: number): string => terrainProtoCacheKey({ seed: '1234', chunkX });

describe('TerrainProtoCache', () => {
    it('writes an atomic versioned record and reads the same region', async () => {
        const root = directory();
        const events: string[] = [];
        const cache = new TerrainProtoCache({
            directory: root,
            maxBytes: 1024 * 1024,
            onEvent: ({ type }) => events.push(type)
        });
        const region = payload(3, -4);

        await cache.write(key(3), region);

        const files = readdirSync(root);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^terrain-[a-f0-9]{64}\.bin$/);
        expect(events).toContain('write');
        await expect(cache.read(key(3), identity(3, -4))).resolves.toMatchObject({
            chunkX: 3,
            chunkZ: -4,
            minY: -64,
            height: 384,
            radius: 0,
            palette: region.palette
        });
        expect(events).toContain('hit');
    });

    it('rejects a corrupt record and deletes it for clean regeneration', async () => {
        const root = directory();
        const events: string[] = [];
        const cache = new TerrainProtoCache({
            directory: root,
            maxBytes: 1024 * 1024,
            onEvent: ({ type }) => events.push(type)
        });
        const recordKey = key(3);
        await cache.write(recordKey, payload(3, -4));

        const path = join(root, readdirSync(root)[0]!);
        const bytes = readFileSync(path);
        const finalByte = bytes.at(-1);
        if (finalByte === undefined) throw new Error('Terrain cache record is empty');
        bytes[bytes.length - 1] = finalByte ^ 1;
        writeFileSync(path, bytes);

        await expect(cache.read(recordKey, identity(3, -4))).resolves.toBeUndefined();
        expect(events).toContain('corrupt');
        expect(readdirSync(root)).toEqual([]);
    });

    it('invalidates records whose chunk geometry no longer matches', async () => {
        const root = directory();
        const events: string[] = [];
        const cache = new TerrainProtoCache({
            directory: root,
            maxBytes: 1024 * 1024,
            onEvent: ({ type }) => events.push(type)
        });
        const recordKey = key(3);
        await cache.write(recordKey, payload(3, -4));

        await expect(cache.read(recordKey, identity(4, -4))).resolves.toBeUndefined();
        expect(events).toContain('invalidate');
        expect(readdirSync(root)).toEqual([]);
    });

    it('keeps record bytes within its budget and evicts older records', async () => {
        const root = directory();
        const calibration = new TerrainProtoCache({ directory: root, maxBytes: 1024 * 1024 });
        await calibration.write(key(1), payload(1, 0));
        const firstSize = statSync(join(root, readdirSync(root)[0]!)).size;
        const events: string[] = [];
        const cache = new TerrainProtoCache({
            directory: root,
            maxBytes: firstSize * 2,
            onEvent: ({ type }) => events.push(type)
        });

        await cache.write(key(2), payload(2, 0));
        await cache.write(key(3), payload(3, 0));

        const files = readdirSync(root);
        const heldBytes = files.reduce((total, file) => total + statSync(join(root, file)).size, 0);
        expect(heldBytes).toBeLessThanOrEqual(firstSize * 2);
        expect(files).toHaveLength(2);
        expect(events).toContain('evict');
        await expect(cache.read(key(3), identity(3, 0))).resolves.toMatchObject({ chunkX: 3 });
    });

    it('stays within its budget across many writes between directory scans', async () => {
        const root = directory();
        const calibration = new TerrainProtoCache({ directory: root, maxBytes: 1024 * 1024 });
        await calibration.write(key(0), payload(0, 0));
        const recordSize = statSync(join(root, readdirSync(root)[0]!)).size;
        const cache = new TerrainProtoCache({ directory: root, maxBytes: recordSize * 3 });

        for (let chunkX = 1; chunkX <= 8; chunkX++) await cache.write(key(chunkX), payload(chunkX, 0));

        const files = readdirSync(root);
        const heldBytes = files.reduce((total, file) => total + statSync(join(root, file)).size, 0);
        expect(heldBytes).toBeLessThanOrEqual(recordSize * 3);
        await expect(cache.read(key(8), identity(8, 0))).resolves.toMatchObject({ chunkX: 8 });
    });

    it('hashes a large input the same as its pieces written one at a time', () => {
        const large = { rows: Array.from({ length: 20000 }, (_, index) => ({ index, name: `row:${index}` })) };
        const reference = createHash('sha256');
        const write = (text: string): void => void reference.update(text);
        write('object:{');
        write(`string:${JSON.stringify('rows')};`);
        write('array:[');
        for (const row of large.rows) {
            write('object:{');
            write(`string:${JSON.stringify('index')};`);
            write(`number:${row.index};`);
            write(`string:${JSON.stringify('name')};`);
            write(`string:${JSON.stringify(row.name)};`);
            write('}object;');
        }
        write(']array;');
        write('}object;');

        expect(fingerprintWorldgenInput(large)).toBe(reference.digest('hex'));
    });

    it('hashes a pre-serialized input exactly like the value it came from', () => {
        const dimension = { id: 'minecraft:overworld', minY: -64, height: 384 };
        const settings = new Map<string, unknown>([
            ['seaLevel', 63],
            ['noise', { sizeHorizontal: 1, tags: ['a', 'b'], legacy: null, lava: true }]
        ]);

        expect(
            fingerprintWorldgenInput({
                dimension: canonicalWorldgenInput(dimension),
                settings: canonicalWorldgenInput(settings),
                chunk: { x: 3, z: -4 }
            })
        ).toBe(fingerprintWorldgenInput({ dimension, settings, chunk: { x: 3, z: -4 } }));
    });

    it('fingerprints registry maps independent of insertion order and separates changed inputs', () => {
        expect(
            fingerprintWorldgenInput(
                new Map([
                    ['b', 2],
                    ['a', 1]
                ])
            )
        ).toBe(
            fingerprintWorldgenInput(
                new Map([
                    ['a', 1],
                    ['b', 2]
                ])
            )
        );
        expect(fingerprintWorldgenInput({ settings: { seaLevel: 63 } })).not.toBe(
            fingerprintWorldgenInput({ settings: { seaLevel: 64 } })
        );

        const input = {
            seed: '1234',
            dimension: { id: 'minecraft:overworld', minY: -64, height: 384 },
            settings: { seaLevel: 63 },
            effectiveDataPackRegistryFingerprint: 'packs-and-registries-a',
            templateFingerprint: 'templates-a',
            chunk: { x: 3, z: -4 }
        };
        const changed = [
            { ...input, seed: '1235' },
            { ...input, dimension: { ...input.dimension, height: 256 } },
            { ...input, settings: { seaLevel: 64 } },
            { ...input, effectiveDataPackRegistryFingerprint: 'packs-and-registries-b' },
            { ...input, templateFingerprint: 'templates-b' },
            { ...input, chunk: { x: 4, z: -4 } }
        ];
        for (const value of changed) expect(terrainProtoCacheKey(value)).not.toBe(terrainProtoCacheKey(input));
    });
});
