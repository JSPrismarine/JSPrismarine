import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { GenerationRegionPayload } from './GenerationRegion';
import { SharedTerrainTileStore } from './SharedTerrainTileStore';

const storeOptions = { maxBytes: 32 * 1024, maxTileBytes: 4096 };

const key = (name: string): string => createHash('sha256').update(name).digest('hex');

const payload = (chunkX: number, blockState = 0): GenerationRegionPayload => {
    const states = new Uint16Array(16 * 16);
    states[0] = blockState;
    return {
        chunkX,
        chunkZ: -3,
        minY: 0,
        height: 1,
        radius: 0,
        palette: [{ java: { name: 'minecraft:air', properties: {} } }],
        states: states.buffer,
        highest: new ArrayBuffer(16 * 16 * Int32Array.BYTES_PER_ELEMENT),
        blockEntities: [],
        entitySpawns: []
    };
};

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

describe('SharedTerrainTileStore', () => {
    it('lets one owner build while contending workers observe only the published payload', async () => {
        const firstStore = new SharedTerrainTileStore(storeOptions);
        const contendingStore = new SharedTerrainTileStore(firstStore.buffer);
        const started = deferred<void>();
        const releaseBuild = deferred<GenerationRegionPayload>();
        const wantedKey = key('same terrain identity');
        let builds = 0;

        const first = firstStore.getOrCreate(wantedKey, 10, async () => {
            builds++;
            started.resolve();
            return releaseBuild.promise;
        });
        await started.promise;

        const second = contendingStore.getOrCreate(wantedKey, 11, async () => {
            builds++;
            return payload(4, 99);
        });
        releaseBuild.resolve(payload(4, 17));

        const [built, observed] = await Promise.all([first, second]);
        expect(built.chunkX).toBe(4);
        expect(observed.chunkX).toBe(4);
        expect(new Uint16Array(observed.states)[0]).toBe(17);
        expect(builds).toBe(1);
        expect(firstStore.getStats()).toMatchObject({ builds: 1, hits: 1, waits: 1 });
    });

    it('recovers an abandoned claim and prevents its former owner from overwriting the replacement', async () => {
        const ownerStore = new SharedTerrainTileStore(storeOptions);
        const replacementStore = new SharedTerrainTileStore(ownerStore.buffer);
        const started = deferred<void>();
        const releaseAbandonedBuild = deferred<GenerationRegionPayload>();
        const wantedKey = key('abandoned terrain identity');

        const abandoned = ownerStore.getOrCreate(wantedKey, 31, async () => {
            started.resolve();
            return releaseAbandonedBuild.promise;
        });
        await started.promise;

        expect(ownerStore.recoverOwner(31)).toBe(1);
        const replacement = await replacementStore.getOrCreate(wantedKey, 32, async () => payload(6, 22));
        expect(new Uint16Array(replacement.states)[0]).toBe(22);

        releaseAbandonedBuild.resolve(payload(6, 7));
        await abandoned;
        const readBack = await ownerStore.getOrCreate(wantedKey, 33, async () => {
            throw new Error('The replacement should already be published');
        });

        expect(new Uint16Array(readBack.states)[0]).toBe(22);
        expect(ownerStore.getStats()).toMatchObject({ builds: 2, hits: 1, recoveredClaims: 1 });
    });

    it('keeps allocation fixed and builds locally when every slot is occupied', async () => {
        const store = new SharedTerrainTileStore({ maxBytes: 5000, maxTileBytes: 4096 });
        const allocatedBytes = store.byteLength;
        let builds = 0;

        await store.getOrCreate(key('first tile'), 0, async () => {
            builds++;
            return payload(1);
        });
        const fallback = await store.getOrCreate(key('second tile'), 0, async () => {
            builds++;
            return payload(2, 9);
        });
        const hit = await store.getOrCreate(key('first tile'), 0, async () => {
            builds++;
            return payload(1, 99);
        });

        expect(store.capacity).toBe(1);
        expect(store.byteLength).toBe(allocatedBytes);
        expect(store.byteLength).toBeLessThanOrEqual(5000);
        expect(new Uint16Array(fallback.states)[0]).toBe(9);
        expect(new Uint16Array(hit.states)[0]).toBe(0);
        expect(builds).toBe(2);
        expect(store.getStats()).toMatchObject({ builds: 2, hits: 1, fullFallbacks: 1 });
    });

    it('rejects owner IDs that would collide with atomic slot markers', async () => {
        const store = new SharedTerrainTileStore(storeOptions);

        await expect(store.getOrCreate(key('invalid owner'), 0x7fff_ffff, async () => payload(0))).rejects.toThrow(
            RangeError
        );
    });
});
