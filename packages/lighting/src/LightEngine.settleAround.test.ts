import { describe, expect, it } from 'vitest';

import { LightEngine } from './LightEngine';
import { TestBlockLightView, lightBlock } from './testing';

const STONE = lightBlock({ lightDampening: 15 });
const WATER = lightBlock({ lightDampening: 2 });
const GLOWSTONE = lightBlock({ lightEmission: 15 });
const LANTERN = lightBlock({ lightEmission: 10 });

const WORLD_HEIGHT = 24;

/** Every chunk within `radius` of the origin, nearest ring first. */
const chunksAround = (radius: number): (readonly [number, number])[] => {
    const chunks: (readonly [number, number])[] = [];
    for (let ring = 0; ring <= radius; ring++) {
        for (let chunkX = -ring; chunkX <= ring; chunkX++) {
            for (let chunkZ = -ring; chunkZ <= ring; chunkZ++) {
                if (Math.max(Math.abs(chunkX), Math.abs(chunkZ)) === ring) chunks.push([chunkX, chunkZ]);
            }
        }
    }
    return chunks;
};

/**
 * Uneven ground under roofs that straddle the chunk borders, with a lantern and a pool in every
 * chunk, so both layers have to cross borders to settle. Every chunk holds the same blocks.
 */
const roughWorld = (radius: number): TestBlockLightView => {
    const view = new TestBlockLightView({ minY: 0, maxY: WORLD_HEIGHT });
    for (let x = -radius * 16; x < (radius + 1) * 16; x++) {
        for (let z = -radius * 16; z < (radius + 1) * 16; z++) {
            const height = 2 + ((x * 7 + z * 13) & 3);
            for (let y = 0; y < height; y++) view.place(x, y, z, STONE);
            if (((x + 4) & 15) < 8) view.place(x, 12, z, STONE);
            if ((x & 15) === 14 && (z & 15) === 1) view.place(x, 8, z, LANTERN);
            if ((x & 15) === 6 && (z & 15) > 12) view.place(x, height, z, WATER);
        }
    }
    return view;
};

const load = (view: TestBlockLightView, radius: number): LightEngine => {
    const engine = new LightEngine(view);
    for (const [chunkX, chunkZ] of chunksAround(radius)) engine.onChunkLoaded(chunkX, chunkZ);
    return engine;
};

/** Both layers of every block of one chunk, in a fixed order. */
const lightOf = (engine: LightEngine, chunkX: number, chunkZ: number): number[] => {
    const levels: number[] = [];
    for (let x = chunkX * 16; x < chunkX * 16 + 16; x++) {
        for (let z = chunkZ * 16; z < chunkZ * 16 + 16; z++) {
            for (let y = 0; y < WORLD_HEIGHT; y++) {
                levels.push(engine.getBlockLight(x, y, z), engine.getSkyLight(x, y, z));
            }
        }
    }
    return levels;
};

describe('LightEngine settleAround', () => {
    it('leaves the chunk with the light a full flush gives it', () => {
        const flushed = load(roughWorld(3), 3);
        flushed.flush();

        const settled = load(roughWorld(3), 3);
        settled.settleAround(0, 0);

        expect(settled.isSettledAround(0, 0)).toBe(true);
        expect(lightOf(settled, 0, 0)).toEqual(lightOf(flushed, 0, 0));
    });

    it('leaves the floods it cannot be reached by queued', () => {
        const engine = load(roughWorld(3), 3);
        const before = engine.pending.queued;

        const result = engine.settleAround(0, 0);

        expect(result.processed).toBeGreaterThan(0);
        expect(result.queued).toBeGreaterThan(0);
        expect(result.queued).toBe(engine.pending.queued);
        expect(result.processed).toBeLessThan(before);
        expect(engine.isFloodingAround(3, 3)).toBe(true);
    });

    it('does the same work whatever is queued beyond its reach', () => {
        const small = load(roughWorld(2), 2).settleAround(0, 0);
        const large = load(roughWorld(5), 5).settleAround(0, 0);

        expect(large.processed).toBe(small.processed);
    });

    it('reaches the light a full flush gives every chunk once the rest is flushed', () => {
        const flushed = load(roughWorld(2), 2);
        flushed.flush();

        const settled = load(roughWorld(2), 2);
        settled.settleAround(1, -1);
        settled.settleAround(-2, 2);
        while (settled.flush(64).queued > 0);

        for (const [chunkX, chunkZ] of chunksAround(2)) {
            expect(lightOf(settled, chunkX, chunkZ)).toEqual(lightOf(flushed, chunkX, chunkZ));
        }
    });

    it('darkens a chunk whose light source was removed, and no chunk further away', () => {
        const build = () => {
            const view = new TestBlockLightView({ minY: 0, maxY: WORLD_HEIGHT, hasSkyLight: false });
            view.place(8, 10, 8, GLOWSTONE);
            view.place(72, 10, 8, GLOWSTONE);
            const engine = new LightEngine(view);
            for (let chunkX = -1; chunkX <= 5; chunkX++) engine.onChunkLoaded(chunkX, 0);
            engine.flush();

            for (const x of [8, 72]) {
                view.place(x, 10, 8, lightBlock({}));
                engine.onBlockChanged({ x, y: 10, z: 8 }, GLOWSTONE, lightBlock({}));
            }
            return engine;
        };

        const flushed = build();
        flushed.flush();

        const settled = build();
        settled.settleAround(0, 0);

        expect(lightOf(settled, 0, 0)).toEqual(lightOf(flushed, 0, 0));
        expect(settled.getBlockLight(9, 10, 8)).toBe(0);
        // The source four chunks away went too, and its light still stands until a flush reaches it.
        expect(settled.getBlockLight(73, 10, 8)).toBe(14);
        expect(settled.isFloodingAround(4, 0)).toBe(true);
    });

    it('stops at its budget and carries on where it stopped', () => {
        const flushed = load(roughWorld(2), 2);
        flushed.flush();

        const settled = load(roughWorld(2), 2);
        const first = settled.settleAround(0, 0, 100);
        expect(first.processed).toBe(100);
        expect(settled.isFloodingAround(0, 0)).toBe(true);

        let calls = 1;
        while (settled.isFloodingAround(0, 0)) {
            expect(settled.settleAround(0, 0, 100).processed).toBeLessThanOrEqual(100);
            calls++;
        }

        expect(calls).toBeGreaterThan(2);
        expect(lightOf(settled, 0, 0)).toEqual(lightOf(flushed, 0, 0));
    });

    it('rejects a budget that is not a count of nodes', () => {
        const engine = load(roughWorld(0), 0);

        expect(() => engine.settleAround(0, 0, -1)).toThrow(RangeError);
        expect(() => engine.settleAround(0, 0, Number.NaN)).toThrow(RangeError);
    });

    it('does nothing around a chunk with no light queued near it', () => {
        const engine = load(roughWorld(1), 1);
        engine.flush();

        expect(engine.settleAround(0, 0)).toEqual({ processed: 0, queued: 0, deferred: engine.pending.deferred });
    });
});
