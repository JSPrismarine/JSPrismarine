import { describe, expect, it } from 'vitest';

import type { BlockLightProperties } from './BlockLightView';
import { LightEngine } from './LightEngine';
import type { LightFlushResult } from './LightEngine';
import { TestBlockLightView, lightBlock } from './testing';

const AIR = lightBlock({});
const STONE = lightBlock({ lightDampening: 15 });
const GLASS = lightBlock({ lightDampening: 0 });
const LEAVES = lightBlock({ lightDampening: 1 });
const WATER = lightBlock({ lightDampening: 2 });
const GLOWSTONE = lightBlock({ lightEmission: 15 });
const TORCH = lightBlock({ lightEmission: 14 });
/** A block that both emits and blocks, the awkward case for the decrease queue. */
const LIT_FURNACE = lightBlock({ lightEmission: 7, lightDampening: 15 });

const PALETTE = [AIR, STONE, GLASS, LEAVES, WATER, GLOWSTONE, TORCH, LIT_FURNACE] as const;

const WORLD_HEIGHT = 24;
const CHUNKS = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
] as const;

const settle = (engine: LightEngine): LightFlushResult => {
    for (;;) {
        const result = engine.flush(4096);
        if (result.queued === 0) return result;
    }
};

const loadAll = (engine: LightEngine): void => {
    for (const [chunkX, chunkZ] of CHUNKS) engine.onChunkLoaded(chunkX, chunkZ);
};

/** Mulberry32, so a failing run is reproducible from its seed. */
const randomFrom = (seed: number): (() => number) => {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

const buildTerrain = (view: TestBlockLightView, random: () => number): void => {
    for (let x = 0; x < 32; x++) {
        for (let z = 0; z < 32; z++) {
            const height = 2 + Math.floor(random() * 8);
            for (let y = 0; y < height; y++) view.place(x, y, z, STONE);

            const roll = random();
            if (roll < 0.06) view.place(x, height, z, GLOWSTONE);
            else if (roll < 0.14) view.place(x, height, z, LEAVES);
            else if (roll < 0.22) {
                view.place(x, height, z, WATER);
                view.place(x, height + 1, z, WATER);
            }

            if (random() < 0.1) view.place(x, height + 4, z, STONE);
        }
    }
};

const differences = (left: LightEngine, right: LightEngine): string[] => {
    const found: string[] = [];

    for (let x = 0; x < 32 && found.length < 10; x++) {
        for (let z = 0; z < 32 && found.length < 10; z++) {
            for (let y = 0; y < WORLD_HEIGHT && found.length < 10; y++) {
                const leftBlock = left.getBlockLight(x, y, z);
                const rightBlock = right.getBlockLight(x, y, z);
                if (leftBlock !== rightBlock) {
                    found.push(`block light at ${x},${y},${z}: ${leftBlock} against ${rightBlock}`);
                }

                const leftSky = left.getSkyLight(x, y, z);
                const rightSky = right.getSkyLight(x, y, z);
                if (leftSky !== rightSky) {
                    found.push(`sky light at ${x},${y},${z}: ${leftSky} against ${rightSky}`);
                }
            }
        }
    }

    return found;
};

const applyChange = (view: TestBlockLightView, engine: LightEngine, random: () => number): BlockLightProperties => {
    const x = Math.floor(random() * 32);
    const y = Math.floor(random() * WORLD_HEIGHT);
    const z = Math.floor(random() * 32);
    const next = PALETTE[Math.floor(random() * PALETTE.length)]!;
    const previous = view.place(x, y, z, next);
    engine.onBlockChanged({ x, y, z }, previous, next);

    return next;
};

describe('LightEngine incremental updates', () => {
    it.each([1, 2, 3])('matches a full recompute after a random change sequence, seed %i', (seed: number) => {
        const random = randomFrom(seed);
        const view = new TestBlockLightView({ minY: 0, maxY: WORLD_HEIGHT });
        buildTerrain(view, random);

        const incremental = new LightEngine(view);
        loadAll(incremental);
        settle(incremental);

        for (let change = 0; change < 200; change++) {
            applyChange(view, incremental, random);
            settle(incremental);
        }

        const reference = new LightEngine(view);
        loadAll(reference);
        settle(reference);

        expect(differences(incremental, reference)).toEqual([]);
    });

    it('matches a full recompute when many changes settle together', () => {
        const random = randomFrom(97);
        const view = new TestBlockLightView({ minY: 0, maxY: WORLD_HEIGHT });
        buildTerrain(view, random);

        const incremental = new LightEngine(view);
        loadAll(incremental);
        settle(incremental);

        for (let batch = 0; batch < 20; batch++) {
            for (let change = 0; change < 10; change++) applyChange(view, incremental, random);
            settle(incremental);
        }

        const reference = new LightEngine(view);
        loadAll(reference);
        settle(reference);

        expect(differences(incremental, reference)).toEqual([]);
    });

    it('matches a full recompute when the changes are flushed one node at a time', () => {
        const random = randomFrom(404);
        const view = new TestBlockLightView({ minY: 0, maxY: WORLD_HEIGHT });
        buildTerrain(view, random);

        const incremental = new LightEngine(view);
        loadAll(incremental);
        settle(incremental);

        for (let change = 0; change < 60; change++) {
            applyChange(view, incremental, random);
            while (incremental.flush(1).queued > 0);
        }

        const reference = new LightEngine(view);
        loadAll(reference);
        settle(reference);

        expect(differences(incremental, reference)).toEqual([]);
    });
});

describe('LightEngine across chunk borders', () => {
    const borderWorld = () => new TestBlockLightView({ minY: 0, maxY: WORLD_HEIGHT });

    it('carries block light into the next chunk', () => {
        const view = borderWorld();
        view.place(14, 10, 8, GLOWSTONE);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        engine.onChunkLoaded(1, 0);
        settle(engine);

        expect(engine.getBlockLight(15, 10, 8)).toBe(14);
        expect(engine.getBlockLight(16, 10, 8)).toBe(13);
        expect(engine.getBlockLight(20, 10, 8)).toBe(9);
    });

    it('leaves an unloaded neighbor alone instead of shading against it', () => {
        const open = borderWorld();
        open.place(14, 10, 8, GLOWSTONE);
        const complete = new LightEngine(open);
        complete.onChunkLoaded(0, 0);
        complete.onChunkLoaded(1, 0);
        settle(complete);

        const partial = borderWorld();
        partial.place(14, 10, 8, GLOWSTONE);
        partial.unloadChunk(1, 0);
        const engine = new LightEngine(partial);
        engine.onChunkLoaded(0, 0);
        const result = settle(engine);

        expect(engine.getBlockLight(15, 10, 8)).toBe(complete.getBlockLight(15, 10, 8));
        expect(engine.getBlockLight(14, 10, 8)).toBe(complete.getBlockLight(14, 10, 8));
        expect(engine.getBlockLight(16, 10, 8)).toBe(0);
        expect(result.deferred).toBeGreaterThan(0);
    });

    it('finishes the deferred propagation when the neighbor loads', () => {
        const view = borderWorld();
        view.place(14, 10, 8, GLOWSTONE);
        view.unloadChunk(1, 0);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(16, 10, 8)).toBe(0);

        view.loadChunk(1, 0);
        engine.onChunkLoaded(1, 0);
        settle(engine);

        expect(engine.getBlockLight(16, 10, 8)).toBe(13);
        expect(engine.getBlockLight(20, 10, 8)).toBe(9);
    });

    it('carries sky light under an overhang that crosses a chunk border', () => {
        const view = borderWorld();
        for (let x = 10; x < 24; x++) {
            for (let z = 0; z < 32; z++) view.place(x, 10, z, STONE);
        }

        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        engine.onChunkLoaded(1, 0);
        settle(engine);

        expect(engine.getSkyLight(9, 9, 8)).toBe(15);
        expect(engine.getSkyLight(15, 9, 8)).toBe(9);
        expect(engine.getSkyLight(16, 9, 8)).toBe(8);
        expect(engine.getSkyLight(24, 9, 8)).toBe(15);
    });
});
