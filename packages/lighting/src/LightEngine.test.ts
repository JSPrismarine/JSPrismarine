import { beforeEach, describe, expect, it } from 'vitest';

import { LightEngine } from './LightEngine';
import type { LightFlushResult } from './LightEngine';
import { AIR, TestBlockLightView, lightBlock } from './testing';

/** A nether-shaped world: no sky, 32 blocks tall, so only block light is in play. */
const darkWorld = () => new TestBlockLightView({ minY: 0, maxY: 32, hasSkyLight: false });

/** An overworld-shaped world, 32 blocks tall so a test can walk every block of it. */
const skyWorld = () => new TestBlockLightView({ minY: 0, maxY: 32 });

const GLOWSTONE = lightBlock({ lightEmission: 15 });
const LANTERN = lightBlock({ lightEmission: 10 });
const STONE = lightBlock({ lightDampening: 15 });
const WATER = lightBlock({ lightDampening: 2 });

const settle = (engine: LightEngine): LightFlushResult => {
    for (;;) {
        const result = engine.flush(4096);
        if (result.queued === 0) return result;
    }
};

describe('LightEngine block light', () => {
    let view: TestBlockLightView;
    let engine: LightEngine;

    beforeEach(() => {
        view = darkWorld();
        engine = new LightEngine(view);
    });

    it('floods an emitter outwards losing one level per block', () => {
        view.place(2, 10, 2, GLOWSTONE);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(2, 10, 2)).toBe(15);
        expect(engine.getBlockLight(3, 10, 2)).toBe(14);
        expect(engine.getBlockLight(6, 10, 2)).toBe(11);
        expect(engine.getBlockLight(2, 14, 2)).toBe(11);
        expect(engine.getBlockLight(5, 12, 4)).toBe(8);
    });

    it('runs out of light fifteen blocks from the emitter', () => {
        view.place(0, 10, 0, GLOWSTONE);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(14, 10, 0)).toBe(1);
        expect(engine.getBlockLight(15, 10, 0)).toBe(0);
    });

    it('charges the dampening value for the block light enters', () => {
        view.place(2, 10, 2, GLOWSTONE);
        view.place(3, 10, 2, WATER);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(3, 10, 2)).toBe(13);
        expect(engine.getBlockLight(4, 10, 2)).toBe(12);
    });

    it('routes light around an opaque wall instead of through it', () => {
        view.place(2, 10, 2, GLOWSTONE);
        view.place(3, 10, 2, STONE);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(3, 10, 2)).toBe(0);
        expect(engine.getBlockLight(4, 10, 2)).toBe(11);
    });

    it('leaves a sealed room dark outside its walls', () => {
        view.place(5, 10, 5, GLOWSTONE);
        for (const [x, y, z] of [
            [4, 10, 5],
            [6, 10, 5],
            [5, 9, 5],
            [5, 11, 5],
            [5, 10, 4],
            [5, 10, 6]
        ] as const) {
            view.place(x, y, z, STONE);
        }
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(5, 10, 5)).toBe(15);
        expect(engine.getBlockLight(7, 10, 5)).toBe(0);
        expect(engine.getBlockLight(5, 12, 5)).toBe(0);
    });

    it('darkens and re-propagates from the remaining sources when a source is removed', () => {
        view.place(0, 10, 0, GLOWSTONE);
        view.place(6, 10, 0, LANTERN);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(3, 10, 0)).toBe(12);

        view.place(0, 10, 0, AIR);
        engine.onBlockChanged({ x: 0, y: 10, z: 0 }, GLOWSTONE, AIR);
        settle(engine);

        expect(engine.getBlockLight(0, 10, 0)).toBe(4);
        expect(engine.getBlockLight(3, 10, 0)).toBe(7);
        expect(engine.getBlockLight(6, 10, 0)).toBe(10);
    });

    it('lights the world again when a source is placed', () => {
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(4, 10, 4)).toBe(0);

        view.place(2, 10, 2, GLOWSTONE);
        engine.onBlockChanged({ x: 2, y: 10, z: 2 }, AIR, GLOWSTONE);
        settle(engine);

        expect(engine.getBlockLight(2, 10, 2)).toBe(15);
        expect(engine.getBlockLight(4, 10, 4)).toBe(11);
    });

    it('darkens the light a newly placed opaque block used to carry', () => {
        view.place(2, 10, 2, GLOWSTONE);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getBlockLight(3, 10, 2)).toBe(14);

        view.place(3, 10, 2, STONE);
        engine.onBlockChanged({ x: 3, y: 10, z: 2 }, AIR, STONE);
        settle(engine);

        expect(engine.getBlockLight(3, 10, 2)).toBe(0);
        expect(engine.getBlockLight(4, 10, 2)).toBe(11);
    });
});

describe('LightEngine flush budget', () => {
    it('stops at the budget and reports the work still queued', () => {
        const view = darkWorld();
        view.place(8, 10, 8, GLOWSTONE);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);

        const first = engine.flush(1);

        expect(first.processed).toBe(1);
        expect(first.queued).toBeGreaterThan(0);
    });

    it('reaches the same light one node at a time as it does unbudgeted', () => {
        const build = () => {
            const view = darkWorld();
            view.place(8, 10, 8, GLOWSTONE);
            view.place(9, 10, 8, WATER);
            view.place(8, 10, 9, STONE);
            const engine = new LightEngine(view);
            engine.onChunkLoaded(0, 0);
            return engine;
        };

        const unbudgeted = build();
        settle(unbudgeted);

        const budgeted = build();
        let steps = 0;
        while (budgeted.flush(1).queued > 0) steps++;

        expect(steps).toBeGreaterThan(10);
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 0; y < 32; y++) {
                    expect(budgeted.getBlockLight(x, y, z)).toBe(unbudgeted.getBlockLight(x, y, z));
                }
            }
        }
    });

    it('reports nothing queued once the work is done', () => {
        const view = darkWorld();
        view.place(8, 10, 8, GLOWSTONE);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);

        const result = engine.flush();

        expect(result.queued).toBe(0);
        expect(result.processed).toBeGreaterThan(0);
    });
});

describe('LightEngine sky light', () => {
    const fillLayer = (view: TestBlockLightView, y: number, block: typeof STONE, fromX = 0, toX = 15) => {
        for (let x = fromX; x <= toX; x++) {
            for (let z = 0; z <= 15; z++) view.place(x, y, z, block);
        }
    };

    it('fills an open column with full sky light', () => {
        const view = skyWorld();
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(4, 31, 4)).toBe(15);
        expect(engine.getSkyLight(4, 16, 4)).toBe(15);
        expect(engine.getSkyLight(4, 0, 4)).toBe(15);
    });

    it('stops sky light at a floor and leaves the space under it dark', () => {
        const view = skyWorld();
        fillLayer(view, 5, STONE);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(8, 6, 8)).toBe(15);
        expect(engine.getSkyLight(8, 5, 8)).toBe(0);
        expect(engine.getSkyLight(8, 4, 8)).toBe(0);
    });

    it('fades sky light with depth through a dampening block', () => {
        const view = skyWorld();
        for (const y of [10, 11, 12]) fillLayer(view, y, WATER);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(8, 13, 8)).toBe(15);
        expect(engine.getSkyLight(8, 12, 8)).toBe(13);
        expect(engine.getSkyLight(8, 11, 8)).toBe(11);
        expect(engine.getSkyLight(8, 10, 8)).toBe(9);
        expect(engine.getSkyLight(8, 9, 8)).toBe(8);
    });

    it('spreads sideways under an overhang, one level per block', () => {
        const view = skyWorld();
        fillLayer(view, 10, STONE, 8, 15);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(8, 11, 8)).toBe(15);
        expect(engine.getSkyLight(8, 10, 8)).toBe(0);
        expect(engine.getSkyLight(7, 9, 8)).toBe(15);
        expect(engine.getSkyLight(8, 9, 8)).toBe(14);
        expect(engine.getSkyLight(9, 9, 8)).toBe(13);
        expect(engine.getSkyLight(12, 9, 8)).toBe(10);
    });

    it('lowers and restores the column when a block is placed and removed', () => {
        const view = skyWorld();
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(4, 9, 4)).toBe(15);

        view.place(4, 10, 4, STONE);
        engine.onBlockChanged({ x: 4, y: 10, z: 4 }, AIR, STONE);
        settle(engine);

        expect(engine.getSkyLight(4, 11, 4)).toBe(15);
        expect(engine.getSkyLight(4, 10, 4)).toBe(0);
        expect(engine.getSkyLight(4, 9, 4)).toBe(14);

        view.place(4, 10, 4, AIR);
        engine.onBlockChanged({ x: 4, y: 10, z: 4 }, STONE, AIR);
        settle(engine);

        expect(engine.getSkyLight(4, 10, 4)).toBe(15);
        expect(engine.getSkyLight(4, 9, 4)).toBe(15);
    });

    it('darkens the room when a roof closes over it', () => {
        const view = skyWorld();
        fillLayer(view, 10, STONE, 0, 14);
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(14, 9, 8)).toBe(14);

        view.place(15, 10, 8, STONE);
        engine.onBlockChanged({ x: 15, y: 10, z: 8 }, AIR, STONE);
        settle(engine);

        expect(engine.getSkyLight(15, 9, 8)).toBe(14);
        expect(engine.getSkyLight(14, 9, 8)).toBe(13);
    });

    it('keeps the sky layer at zero in a dimension without a sky', () => {
        const view = darkWorld();
        const engine = new LightEngine(view);
        engine.onChunkLoaded(0, 0);
        settle(engine);

        expect(engine.getSkyLight(4, 10, 4)).toBe(0);
    });
});
