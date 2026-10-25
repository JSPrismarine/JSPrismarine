/**
 * The stronghold, against a flat stone world and a writer that records what it is handed.
 *
 * Nothing here reads Mojang's data: the stronghold is laid out in code, so a fake level and a
 * fake writer are the whole of what it needs.
 */
import type { BlockEntityRequest, BlockState } from '@jsprismarine/features';
import type { BoundingBox } from '@jsprismarine/structures';
import { createLegacyRandom, largeFeatureSeed } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import type { StructureBuildContext } from './javaStructureStarts';
import { buildStronghold } from './javaStructureStronghold';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';

const MIN_Y = -64;
const HEIGHT = 384;
const SEA_LEVEL = 63;

/** Where the fake world's stone stops, which is above everything a stronghold reaches. */
const GROUND = 64;

const STONE: BlockState = { name: 'minecraft:stone', properties: {} };
const AIR: BlockState = { name: 'minecraft:air', properties: {} };

/** Solid stone up to {@link GROUND} and air above it, with no cave to interrupt a wall. */
const flatStone: StructureLevel = {
    minY: MIN_Y,
    height: HEIGHT,
    seaLevel: SEA_LEVEL,
    baseHeight: () => GROUND,
    baseBlock: (_x, y) => (y < GROUND ? STONE : AIR),
    noiseBiome: () => 'minecraft:plains'
};

/** The stronghold names no template, so the store only has to exist. */
const noTemplates: StructureTemplateStore = {
    template: () => undefined,
    prepared: () => undefined,
    size: () => undefined,
    processors: () => [],
    javaBlockOf: () => undefined
};

const contextAt = (seed: number, chunkX = 0, chunkZ = 0): StructureBuildContext => ({
    id: 'minecraft:stronghold',
    definition: { type: 'minecraft:stronghold' },
    chunkX,
    chunkZ,
    seed: BigInt(seed),
    random: createLegacyRandom(largeFeatureSeed(BigInt(seed), chunkX, chunkZ)),
    level: flatStone,
    templates: noTemplates,
    pool: () => undefined
});

/** One stronghold laid out, with its deferred pieces assembled once. */
const layoutAt = (seed: number) => {
    const layout = buildStronghold(contextAt(seed));
    expect(layout, `seed ${seed} produced no stronghold`).toBeDefined();
    return { origin: layout!.origin, pieces: layout!.pieces() };
};

/** What writing a stronghold produced, counted rather than stored position by position. */
interface Harvest {
    /** How many blocks of each identifier were written. */
    readonly counts: Map<string, number>;
    /** The whole states of the identifiers that were asked for, in the order they were written. */
    readonly kept: BlockState[];
    /** Every block entity the stronghold attached, with the position it landed at. */
    readonly entities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
}

/**
 * Writes a stronghold and reports what it wrote.
 *
 * The writer keeps no block positions, which is what makes a scan over dozens of seeds
 * affordable. Nothing in a stronghold reads back a position it has written, because no two of
 * its rooms share an interior, so reading the bare terrain is the same answer a chunk gives.
 *
 * @param keep - The identifiers whose full states are collected, for the property assertions.
 */
const harvest = (pieces: readonly StructurePiece[], seed: number, keep: ReadonlySet<string> = new Set()): Harvest => {
    const result: Harvest = { counts: new Map(), kept: [], entities: [] };
    const writer: StructureWriter = {
        level: flatStone,
        blockAt: (x, y, z) => flatStone.baseBlock(x, y, z),
        setBlock: (_x, _y, _z, state) => {
            result.counts.set(state.name, (result.counts.get(state.name) ?? 0) + 1);
            if (keep.has(state.name)) result.kept.push(state);
            return true;
        },
        setBedrockBlock: () => false,
        setBlockEntity: (x, y, z, request) => result.entities.push({ x, y, z, request }),
        spawnEntity: () => {},
        heightAt: (heightmap, x, z) => flatStone.baseHeight(x, z, heightmap),
        hasTag: () => false
    };

    const random = createLegacyRandom(BigInt(seed));
    for (const piece of pieces) piece.place(writer, random);
    return result;
};

/** The first seed in a range whose stronghold writes a block, so no test rests on one draw. */
const seedWriting = (name: string, keep?: ReadonlySet<string>): { seed: number; written: Harvest } => {
    for (let seed = 1; seed <= 40; seed++) {
        const written = harvest(layoutAt(seed).pieces, seed, keep);
        if (written.counts.has(name)) return { seed, written };
    }

    throw new Error(`no stronghold in the first 40 seeds wrote ${name}`);
};

const boxesIntersect = (a: BoundingBox, b: BoundingBox): boolean =>
    a.maxX >= b.minX &&
    a.minX <= b.maxX &&
    a.maxY >= b.minY &&
    a.minY <= b.maxY &&
    a.maxZ >= b.minZ &&
    a.minZ <= b.maxZ;

const signatureOf = (layout: ReturnType<typeof layoutAt>): string =>
    layout.pieces
        .map(({ boundingBox: box }) => `${box.minX},${box.minY},${box.minZ},${box.maxX},${box.maxY},${box.maxZ}`)
        .join('|');

/** How many seeds the scans cover. Each one lays out and writes a whole stronghold. */
const SCANNED_SEEDS = 24;

describe('the stronghold', () => {
    it('starts at the chunk it is given and reports it as the generation point', () => {
        const layout = buildStronghold(contextAt(7, -3, 11));

        expect(layout).toBeDefined();
        expect(layout!.origin).toEqual({ x: -48, y: 0, z: 176 });
    });

    it('settles the whole structure below sea level without reading the terrain', () => {
        const layout = layoutAt(7);
        const top = Math.max(...layout.pieces.map((piece) => piece.boundingBox.maxY));
        const bottom = Math.min(...layout.pieces.map((piece) => piece.boundingBox.minY));

        expect(top).toBeLessThanOrEqual(SEA_LEVEL - 10);
        expect(bottom).toBeGreaterThan(MIN_Y);
    });

    it('always holds a portal room', () => {
        for (let seed = 1; seed <= SCANNED_SEEDS; seed++) {
            const written = harvest(layoutAt(seed).pieces, seed);
            expect(written.counts.get('minecraft:end_portal_frame'), `seed ${seed}`).toBe(12);
        }
    });

    it('builds the portal room out of frames, lava, stairs and a silverfish spawner', () => {
        const { written } = seedWriting('minecraft:end_portal_frame', new Set(['minecraft:end_portal_frame']));

        expect(written.kept).toHaveLength(12);
        expect(new Set(written.kept.map((state) => state.properties.facing))).toEqual(
            new Set(['north', 'south', 'east', 'west'])
        );
        expect(written.counts.has('minecraft:lava')).toBe(true);
        expect(written.counts.get('minecraft:stone_brick_stairs')).toBe(9);

        const spawners = written.entities.filter((entity) => entity.request.id === 'minecraft:mob_spawner');
        expect(spawners.map((entity) => entity.request)).toEqual([
            { id: 'minecraft:mob_spawner', spawnEntity: 'minecraft:silverfish' }
        ]);
    });

    it('leaves an eye in a frame for some seed', () => {
        const frames = new Set(['minecraft:end_portal_frame']);
        const withEye: number[] = [];
        for (let seed = 1; seed <= SCANNED_SEEDS; seed++) {
            const written = harvest(layoutAt(seed).pieces, seed, frames);
            if (written.kept.some((state) => state.properties.eye === 'true')) withEye.push(seed);
        }

        // An eye lands on one frame in ten, so this many strongholds is hundreds of draws.
        expect(withEye.length).toBeGreaterThan(0);
    });

    it('fills the library with bookshelves', () => {
        const { written } = seedWriting('minecraft:bookshelf');

        // The short library alone shelves both long walls and nine stacks down the middle.
        expect(written.counts.get('minecraft:bookshelf')).toBeGreaterThan(50);
        expect(written.counts.has('minecraft:oak_planks')).toBe(true);
    });

    it('puts a chest in the chest corridor on the stronghold corridor loot table', () => {
        const { written } = seedWriting('minecraft:chest');
        const tables = written.entities
            .filter((entity) => entity.request.id === 'minecraft:chest')
            .map((entity) => entity.request.lootTable);

        expect(tables.length).toBeGreaterThan(0);
        expect(tables.every((table) => table?.startsWith('minecraft:chests/stronghold_'))).toBe(true);
        expect(tables).toContain('minecraft:chests/stronghold_corridor');
    });

    it('ages the stone brick walls rather than laying them all plain', () => {
        const written = harvest(layoutAt(7).pieces, 7);
        const of = (name: string): number => written.counts.get(name) ?? 0;

        const plain = of('minecraft:stone_bricks');
        const mossy = of('minecraft:mossy_stone_bricks');
        const cracked = of('minecraft:cracked_stone_bricks');
        const infested = of('minecraft:infested_stone_bricks');

        expect(plain).toBeGreaterThan(0);
        expect(mossy).toBeGreaterThan(0);
        expect(cracked).toBeGreaterThan(0);
        expect(infested).toBeGreaterThan(0);

        // The selector leaves 45 percent of a wall plain, cracks 20, mosses 30 and infests 5.
        const walls = plain + mossy + cracked + infested;
        expect(mossy / walls).toBeGreaterThan(0.1);
        expect(plain / walls).toBeLessThan(0.9);
    });

    it('never builds one room inside another', () => {
        for (let seed = 1; seed <= SCANNED_SEEDS; seed++) {
            // Only the filler corridors are left out, and only because Java lays one out to end
            // one block inside the room it plugs, which is an overlap the game has. Every room
            // is at least five by five, and a filler is the only piece two or three deep.
            const rooms = layoutAt(seed)
                .pieces.map((piece) => piece.boundingBox)
                .filter((box) => Math.min(box.maxX - box.minX, box.maxZ - box.minZ) + 1 >= 5);

            expect(rooms.length).toBeGreaterThan(10);

            // Collected rather than asserted inside the loop: 24 strongholds is a few hundred
            // rooms each, and an `expect` per pair is millions of assertion objects.
            const overlaps: string[] = [];
            for (let first = 0; first < rooms.length; first++) {
                for (let second = first + 1; second < rooms.length; second++) {
                    if (boxesIntersect(rooms[first]!, rooms[second]!)) overlaps.push(`${first} and ${second}`);
                }
            }

            expect(overlaps, `seed ${seed}`).toEqual([]);
        }
    });

    it('plugs a gap with a filler corridor rather than leaving a room open to the stone', () => {
        const { pieces } = layoutAt(1);
        const fillers = pieces.filter((piece) => {
            const box = piece.boundingBox;
            return Math.min(box.maxX - box.minX, box.maxZ - box.minZ) + 1 < 5;
        });

        expect(fillers.length).toBeGreaterThan(0);
        for (const filler of fillers) {
            const span = Math.min(
                filler.boundingBox.maxX - filler.boundingBox.minX,
                filler.boundingBox.maxZ - filler.boundingBox.minZ
            );
            // Java only ever fills a gap of one or two blocks, and adds a wall to it.
            expect(span + 1).toBeGreaterThanOrEqual(2);
            expect(span + 1).toBeLessThanOrEqual(3);
        }
    });

    it('writes each room inside its own box, whichever way the room faces', () => {
        for (let seed = 1; seed <= 8; seed++) {
            for (const piece of layoutAt(seed).pieces) {
                const box = piece.boundingBox;
                let outside = 0;
                const writer: StructureWriter = {
                    level: flatStone,
                    blockAt: (x, y, z) => flatStone.baseBlock(x, y, z),
                    setBlock: (x, y, z) => {
                        // A door's button is the one block a room writes beyond its own wall.
                        const inside =
                            x >= box.minX - 1 &&
                            x <= box.maxX + 1 &&
                            y >= box.minY - 1 &&
                            y <= box.maxY + 1 &&
                            z >= box.minZ - 1 &&
                            z <= box.maxZ + 1;
                        if (!inside) outside++;
                        return true;
                    },
                    setBedrockBlock: () => false,
                    setBlockEntity: () => {},
                    spawnEntity: () => {},
                    heightAt: (heightmap, x, z) => flatStone.baseHeight(x, z, heightmap),
                    hasTag: () => false
                };

                piece.place(writer, createLegacyRandom(BigInt(seed)));
                expect(outside, `seed ${seed}: a room wrote outside its box`).toBe(0);
            }
        }
    });

    it('lays out the same stronghold for one seed and a different one for another', () => {
        expect(signatureOf(layoutAt(7))).toBe(signatureOf(layoutAt(7)));
        expect(signatureOf(layoutAt(7))).not.toBe(signatureOf(layoutAt(8)));
    });
});
