/**
 * The nether fortress, against a flat netherrack world and a writer that records what it is
 * handed.
 *
 * Nothing here reads Mojang's data: the fortress is laid out in code, so a fake level and a
 * fake writer are the whole of what it needs. The layouts are checked against the pieces the
 * 26.3 server jar itself lays out for the same seeds, dumped by running
 * `NetherFortressStructure.generatePieces` step by step against `NetherFortressPieces`.
 */
import type { BlockEntityRequest, BlockState } from '@jsprismarine/features';
import type { BoundingBox } from '@jsprismarine/structures';
import { createLegacyRandom, largeFeatureSeed } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildNetherFortress, fortressPieceSignature } from './javaStructureFortress';
import type { StructureBuildContext } from './javaStructureStarts';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';

const MIN_Y = 0;
const HEIGHT = 256;
const SEA_LEVEL = 32;

/** Where the fake world's netherrack stops, which is below every bridge a fortress hangs. */
const GROUND = 40;

const NETHERRACK: BlockState = { name: 'minecraft:netherrack', properties: {} };
const AIR: BlockState = { name: 'minecraft:air', properties: {} };

/** Solid netherrack up to {@link GROUND} and air above it, with no cave or lava to interrupt a pillar. */
const flatNetherrack: StructureLevel = {
    minY: MIN_Y,
    height: HEIGHT,
    seaLevel: SEA_LEVEL,
    baseHeight: () => GROUND,
    baseBlock: (_x, y) => (y < GROUND ? NETHERRACK : AIR),
    noiseBiome: () => 'minecraft:nether_wastes'
};

/** The fortress names no template, so the store only has to exist. */
const noTemplates: StructureTemplateStore = {
    template: () => undefined,
    prepared: () => undefined,
    size: () => undefined,
    processors: () => [],
    javaBlockOf: () => undefined
};

const contextAt = (seed: number, chunkX = 0, chunkZ = 0): StructureBuildContext => ({
    id: 'minecraft:fortress',
    definition: { type: 'minecraft:fortress' },
    chunkX,
    chunkZ,
    seed: BigInt(seed),
    random: createLegacyRandom(largeFeatureSeed(BigInt(seed), chunkX, chunkZ)),
    level: flatNetherrack,
    templates: noTemplates,
    pool: () => undefined
});

/** One fortress laid out, with its deferred pieces assembled once. */
const layoutAt = (seed: number, chunkX = 0, chunkZ = 0) => {
    const layout = buildNetherFortress(contextAt(seed, chunkX, chunkZ));
    expect(layout, `seed ${seed} produced no fortress`).toBeDefined();
    return { origin: layout!.origin, pieces: layout!.pieces() };
};

const signaturesOf = (pieces: readonly StructurePiece[]): string[] =>
    pieces.map((piece) => {
        const signature = fortressPieceSignature(piece);
        expect(signature).toBeDefined();
        return signature!;
    });

const unionOf = (pieces: readonly StructurePiece[]): BoundingBox =>
    pieces
        .map((piece) => piece.boundingBox)
        .reduce((box, next) => ({
            minX: Math.min(box.minX, next.minX),
            minY: Math.min(box.minY, next.minY),
            minZ: Math.min(box.minZ, next.minZ),
            maxX: Math.max(box.maxX, next.maxX),
            maxY: Math.max(box.maxY, next.maxY),
            maxZ: Math.max(box.maxZ, next.maxZ)
        }));

/** What writing a fortress produced, counted rather than stored position by position. */
interface Harvest {
    /** How many blocks of each identifier were written. */
    readonly counts: Map<string, number>;
    /** The whole states of the identifiers that were asked for, in the order they were written. */
    readonly kept: BlockState[];
    /** Every block entity the fortress attached, with the position it landed at. */
    readonly entities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
}

/**
 * Writes a fortress and reports what it wrote.
 *
 * The writer keeps no block positions, so the pillars under the bridges read the bare terrain
 * and stop at the netherrack, as they do in a chunk with nothing else in the column.
 *
 * @param keep - The identifiers whose full states are collected, for the property assertions.
 */
const harvest = (pieces: readonly StructurePiece[], seed: number, keep: ReadonlySet<string> = new Set()): Harvest => {
    const result: Harvest = { counts: new Map(), kept: [], entities: [] };
    const writer: StructureWriter = {
        level: flatNetherrack,
        blockAt: (x, y, z) => flatNetherrack.baseBlock(x, y, z),
        setBlock: (_x, _y, _z, state) => {
            result.counts.set(state.name, (result.counts.get(state.name) ?? 0) + 1);
            if (keep.has(state.name)) result.kept.push(state);
            return true;
        },
        setBedrockBlock: () => false,
        setBlockEntity: (x, y, z, request) => result.entities.push({ x, y, z, request }),
        spawnEntity: () => {},
        heightAt: (heightmap, x, z) => flatNetherrack.baseHeight(x, z, heightmap),
        hasTag: () => false
    };

    const random = createLegacyRandom(BigInt(seed));
    for (const piece of pieces) piece.place(writer, random);
    return result;
};

/**
 * The pieces Java lays out for seed 7 at chunk (0, 0), in the order it adds them.
 *
 * Each line is the piece type, the facing, the generation depth and the box, as
 * `fortressPieceSignature` prints them. This seed grows a castle with every corridor piece in
 * it, which is what makes it the one to pin whole.
 */
const JAVA_SEED_7_PIECES = [
    'bridge_crossing south 0 2,56,2,20,65,20',
    'stairs_room south 1 8,59,21,14,69,27',
    'bridge_straight west 1 -17,56,9,1,65,13',
    'room_crossing east 1 21,59,8,27,67,14',
    'bridge_crossing west 2 -36,56,2,-18,65,20',
    'room_crossing east 2 28,59,8,34,67,14',
    'monster_throne north 2 21,59,-1,27,66,7',
    'stairs_room south 2 21,59,15,27,69,21',
    'bridge_straight east 2 15,62,22,33,71,26',
    'bridge_straight east 3 28,62,16,46,71,20',
    'bridge_straight west 3 -55,56,9,-37,65,13',
    'bridge_straight north 3 -29,56,-17,-25,65,1',
    'bridge_straight south 3 -29,56,21,-25,65,39',
    'castle_entrance east 4 47,62,12,59,75,24',
    'bridge_straight north 4 -29,56,-36,-25,65,-18',
    'room_crossing east 3 35,59,8,41,67,14',
    'stairs_room north 3 28,59,1,34,69,7',
    'bridge_straight south 4 -29,56,40,-25,65,58',
    'room_crossing east 4 35,65,1,41,73,7',
    'monster_throne east 3 34,65,21,42,72,27',
    'castle_corridor_t_balcony east 5 60,65,14,68,71,22',
    'castle_corridor_stairs north 6 60,58,4,64,71,13',
    'castle_small_corridor south 6 60,65,23,64,71,27',
    'bridge_crossing north 5 -36,56,-55,-18,65,-37',
    'bridge_straight north 6 -29,56,-74,-25,65,-56',
    'bridge_straight west 6 -55,56,-48,-37,65,-44',
    'bridge_straight east 6 -17,56,-48,1,65,-44',
    'bridge_end_filler east 5 42,62,2,49,71,6',
    'bridge_crossing north 5 29,62,-18,47,71,0',
    'bridge_straight north 7 -29,56,-93,-25,65,-75',
    'bridge_straight west 7 -74,56,-48,-56,65,-44',
    'bridge_straight north 6 36,62,-37,40,71,-19',
    'bridge_straight west 6 10,62,-11,28,71,-7',
    'bridge_crossing east 6 48,62,-18,66,71,0',
    'castle_small_corridor south 7 60,65,28,64,71,32',
    'bridge_end_filler west 4 -63,56,9,-56,65,13',
    'bridge_end_filler south 5 -29,56,59,-25,65,66',
    'bridge_end_filler east 7 2,56,-48,9,65,-44',
    'bridge_end_filler west 7 2,62,-11,9,71,-7',
    'bridge_end_filler west 8 -82,56,-48,-75,65,-44',
    'bridge_end_filler north 7 36,62,-45,40,71,-38',
    'bridge_end_filler east 7 67,62,-11,74,71,-7',
    'bridge_end_filler north 7 55,62,-26,59,71,-19',
    'bridge_end_filler south 7 55,62,1,59,71,8',
    'castle_small_corridor_crossing south 8 60,65,33,64,71,37',
    'castle_small_corridor south 9 60,65,38,64,71,42',
    'castle_small_corridor west 9 55,65,33,59,71,37',
    'castle_small_corridor_left_turn east 9 65,65,33,69,71,37',
    'castle_small_corridor_right_turn west 10 50,65,33,54,71,37',
    'castle_small_corridor_crossing south 11 50,65,38,54,71,42',
    'bridge_end_filler north 8 -29,56,-101,-25,65,-94',
    'castle_corridor_stairs north 10 65,58,23,69,71,32',
    'castle_corridor_stairs north 11 65,51,13,69,64,22',
    'castle_small_corridor_right_turn south 10 60,65,43,64,71,47',
    'castle_small_corridor_crossing south 12 50,65,43,54,71,47',
    'castle_small_corridor west 12 45,65,38,49,71,42',
    'castle_small_corridor_crossing east 12 55,65,38,59,71,42',
    'castle_small_corridor_left_turn south 13 55,65,43,59,71,47',
    'castle_small_corridor east 11 65,65,43,69,71,47',
    'castle_small_corridor west 13 40,65,38,44,71,42',
    'castle_small_corridor_right_turn north 12 65,51,8,69,57,12',
    'castle_small_corridor east 12 70,65,43,74,71,47',
    'castle_small_corridor_crossing east 13 70,51,8,74,57,12',
    'castle_corridor_t_balcony east 14 75,51,6,83,57,14',
    'castle_small_corridor_right_turn north 14 70,51,3,74,57,7',
    'castle_small_corridor south 14 70,51,13,74,57,17',
    'castle_small_corridor west 14 35,65,38,39,71,42',
    'castle_stalk_room west 15 22,62,34,34,75,46',
    'castle_small_corridor west 16 17,65,38,21,71,42',
    'castle_small_corridor west 16 17,73,38,21,79,42',
    'castle_small_corridor south 13 50,65,48,54,71,52',
    'castle_small_corridor west 13 45,65,43,49,71,47',
    'castle_small_corridor east 13 75,65,43,79,71,47',
    'castle_small_corridor east 14 80,65,43,84,71,47',
    'castle_small_corridor west 17 12,65,38,16,71,42',
    'castle_small_corridor south 14 50,65,53,54,71,57',
    'castle_small_corridor west 14 40,65,43,44,71,47',
    'castle_small_corridor north 15 75,51,1,79,57,5',
    'castle_small_corridor_left_turn south 15 75,51,15,79,57,19',
    'castle_small_corridor west 18 7,65,38,11,71,42',
    'castle_small_corridor west 15 35,65,43,39,71,47',
    'castle_small_corridor east 15 85,65,43,89,71,47',
    'castle_small_corridor north 16 75,51,-4,79,57,0',
    'castle_small_corridor west 17 12,73,38,16,79,42',
    'castle_small_corridor south 15 50,65,58,54,71,62',
    'castle_small_corridor_left_turn west 18 7,73,38,11,79,42',
    'castle_small_corridor north 19 7,73,33,11,79,37',
    'castle_small_corridor_left_turn east 16 90,65,43,94,71,47',
    'castle_small_corridor_right_turn north 20 7,73,28,11,79,32',
    'castle_small_corridor_left_turn west 19 2,65,38,6,71,42',
    'castle_small_corridor south 16 50,65,63,54,71,67',
    'castle_small_corridor_right_turn north 20 2,65,33,6,71,37',
    'castle_small_corridor east 21 12,73,28,16,79,32',
    'castle_small_corridor south 15 70,51,18,74,57,22',
    'castle_stalk_room north 17 86,62,30,98,75,42',
    'castle_small_corridor north 17 75,51,-9,79,57,-5',
    'castle_small_corridor north 18 75,51,-14,79,57,-10',
    'castle_small_corridor north 18 90,65,25,94,71,29',
    'castle_small_corridor north 18 90,73,25,94,79,29',
    'castle_small_corridor north 19 90,65,20,94,71,24',
    'castle_small_corridor_right_turn east 22 17,73,28,21,79,32',
    'castle_small_corridor north 19 90,73,20,94,79,24',
    'castle_small_corridor north 20 90,73,15,94,79,19',
    'castle_small_corridor north 19 75,51,-19,79,57,-15',
    'castle_small_corridor north 20 75,51,-24,79,57,-20',
    'castle_small_corridor north 21 75,51,-29,79,57,-25',
    'castle_small_corridor_left_turn north 21 90,73,10,94,79,14',
    'castle_small_corridor east 21 7,65,33,11,71,37',
    'castle_small_corridor south 16 70,51,23,74,57,27',
    'castle_small_corridor south 17 50,65,68,54,71,72',
    'castle_small_corridor south 18 50,65,73,54,71,77',
    'castle_small_corridor_right_turn south 19 50,65,78,54,71,82',
    'castle_small_corridor north 22 75,51,-34,79,57,-30',
    'castle_small_corridor_right_turn north 23 75,51,-39,79,57,-35',
    'castle_small_corridor north 20 90,65,15,94,71,19',
    'castle_small_corridor south 23 17,73,33,21,79,37',
    'castle_small_corridor east 22 12,65,33,16,71,37',
    'castle_small_corridor north 21 90,65,10,94,71,14',
    'castle_small_corridor north 22 90,65,5,94,71,9',
    'castle_small_corridor north 23 90,65,0,94,71,4',
    'castle_small_corridor north 24 90,65,-5,94,71,-1',
    'castle_small_corridor east 23 17,65,33,21,71,37',
    'castle_small_corridor south 17 70,51,28,74,57,32',
    'castle_small_corridor west 22 85,73,10,89,79,14',
    'castle_small_corridor east 24 80,51,-39,84,57,-35',
    'castle_small_corridor west 23 80,73,10,84,79,14',
    'castle_small_corridor_right_turn east 25 85,51,-39,89,57,-35',
    'castle_small_corridor north 25 90,65,-10,94,71,-6',
    'castle_small_corridor_left_turn east 20 55,65,78,59,71,82',
    'castle_small_corridor north 26 90,65,-15,94,71,-11',
    'castle_small_corridor north 21 55,65,73,59,71,77',
    'castle_small_corridor north 22 55,65,68,59,71,72',
    'castle_small_corridor north 23 55,65,63,59,71,67',
    'castle_small_corridor north 27 90,65,-20,94,71,-16',
    'castle_small_corridor south 26 85,51,-34,89,57,-30',
    'castle_small_corridor west 24 75,73,10,79,79,14',
    'castle_small_corridor south 27 85,51,-29,89,57,-25',
    'castle_small_corridor west 25 70,73,10,74,79,14',
    'castle_small_corridor north 28 90,65,-25,94,71,-21',
    'castle_small_corridor west 26 65,73,10,69,79,14',
    'castle_small_corridor north 29 90,65,-30,94,71,-26',
    'castle_small_corridor north 24 55,65,58,59,71,62',
    'castle_small_corridor south 18 70,51,33,74,57,37',
    'castle_small_corridor west 27 60,73,10,64,79,14',
    'castle_small_corridor south 19 70,51,38,74,57,42',
    'castle_small_corridor south 20 70,51,43,74,57,47',
    'castle_small_corridor north 30 90,65,-35,94,71,-31',
    'castle_small_corridor north 25 55,65,53,59,71,57',
    'castle_small_corridor south 21 70,51,48,74,57,52',
    'castle_small_corridor south 22 70,51,53,74,57,57',
    'bridge_end_filler north 31 90,62,-43,94,71,-36',
    'castle_small_corridor south 23 70,51,58,74,57,62',
    'castle_small_corridor south 28 85,51,-24,89,57,-20',
    'castle_small_corridor south 29 85,51,-19,89,57,-15',
    'castle_small_corridor south 30 85,51,-14,89,57,-10',
    'castle_small_corridor south 24 70,51,63,74,57,67',
    'bridge_end_filler south 31 85,48,-9,89,57,-2',
    'castle_small_corridor south 25 70,51,68,74,57,72',
    'castle_small_corridor south 26 70,51,73,74,57,77',
    'castle_small_corridor north 26 55,65,48,59,71,52',
    'castle_small_corridor south 27 70,51,78,74,57,82',
    'castle_small_corridor south 28 70,51,83,74,57,87',
    'castle_small_corridor south 29 70,51,88,74,57,92',
    'castle_small_corridor south 30 70,51,93,74,57,97',
    'bridge_end_filler south 31 70,48,98,74,57,105'
];

/** Piece counts and union boxes Java reports for four more seeds, with the castle left out of most. */
const JAVA_SUMMARIES = [
    {
        seed: 99,
        chunkX: 0,
        chunkZ: 0,
        pieces: 43,
        box: { minX: -63, minY: 51, minZ: -44, maxX: 47, maxY: 68, maxZ: 93 }
    },
    {
        seed: 42,
        chunkX: 5,
        chunkZ: -7,
        pieces: 57,
        box: { minX: 29, minY: 48, minZ: -207, maxX: 146, maxY: 75, maxZ: 17 }
    },
    {
        seed: 3,
        chunkX: -20,
        chunkZ: 4,
        pieces: 51,
        box: { minX: -332, minY: 52, minZ: -25, maxX: -202, maxY: 68, maxZ: 162 }
    },
    {
        seed: 1234,
        chunkX: -3,
        chunkZ: 11,
        pieces: 55,
        box: { minX: -131, minY: 48, minZ: 133, maxX: 75, maxY: 77, maxZ: 293 }
    }
];

/** The first seed in a range whose fortress writes a block, so no test rests on one draw. */
const seedWriting = (name: string, keep?: ReadonlySet<string>): { seed: number; written: Harvest } => {
    for (let seed = 1; seed <= 40; seed++) {
        const written = harvest(layoutAt(seed).pieces, seed, keep);
        if (written.counts.has(name)) return { seed, written };
    }

    throw new Error(`no fortress in the first 40 seeds wrote ${name}`);
};

describe('the nether fortress', () => {
    it('reports the chunk corner at bridge height as the generation point', () => {
        const layout = buildNetherFortress(contextAt(7, -3, 11));

        expect(layout).toBeDefined();
        expect(layout!.origin).toEqual({ x: -48, y: 64, z: 176 });
    });

    it('lays out the pieces Java lays out for seed 7, in the same order and at the same boxes', () => {
        expect(signaturesOf(layoutAt(7).pieces)).toEqual(JAVA_SEED_7_PIECES);
    });

    it('matches the piece count and the extent Java reports for four more seeds', () => {
        for (const { seed, chunkX, chunkZ, pieces, box } of JAVA_SUMMARIES) {
            const layout = layoutAt(seed, chunkX, chunkZ);
            expect(layout.pieces, `seed ${seed}`).toHaveLength(pieces);
            expect(unionOf(layout.pieces), `seed ${seed}`).toEqual(box);
        }
    });

    it('starts from a bridge crossing two blocks into the chunk and settles between 48 and 70', () => {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const { pieces } = layoutAt(seed);
            const start = signaturesOf(pieces)[0]!;
            expect(start.startsWith('bridge_crossing ')).toBe(true);
            expect(
                start.endsWith(' 0 2,' + pieces[0]!.boundingBox.minY + ',2,20,' + pieces[0]!.boundingBox.maxY + ',20')
            ).toBe(true);

            const floor = Math.min(...pieces.map((piece) => piece.boundingBox.minY));
            expect(floor, `seed ${seed}`).toBeGreaterThanOrEqual(48);
            expect(floor, `seed ${seed}`).toBeLessThanOrEqual(70);
        }
    });

    it('builds the bridges out of nether bricks with fence railings', () => {
        const written = harvest(layoutAt(99).pieces, 99, new Set(['minecraft:nether_brick_fence']));

        expect(written.counts.get('minecraft:nether_bricks')).toBeGreaterThan(1000);
        expect(written.kept.length).toBeGreaterThan(50);
        // A railing post connects along its bridge, and this seed's bridges run both ways.
        const connected = written.kept.map((state) => Object.keys(state.properties).sort().join(','));
        expect(connected).toContain('east,north,south');
        expect(connected).toContain('north,south,west');
    });

    it('puts a blaze spawner on the monster throne', () => {
        const { written } = seedWriting('minecraft:spawner');
        const spawners = written.entities.filter((entity) => entity.request.id === 'minecraft:mob_spawner');

        expect(spawners.length).toBe(written.counts.get('minecraft:spawner'));
        expect(new Set(spawners.map((entity) => entity.request.spawnEntity))).toEqual(new Set(['minecraft:blaze']));
    });

    it('plants nether wart on soul sand in the stalk room', () => {
        // Seed 7 grows two stalk rooms; each plants two beds of two by five.
        const written = harvest(layoutAt(7).pieces, 7);

        expect(written.counts.get('minecraft:nether_wart')).toBe(40);
        expect(written.counts.get('minecraft:soul_sand')).toBe(40);
    });

    it('leaves a lava well in the floor of the castle entrance', () => {
        const written = harvest(layoutAt(7).pieces, 7);

        expect(written.counts.get('minecraft:lava')).toBe(1);
    });

    it('puts a chest in a corridor turn on the nether bridge loot table', () => {
        const { written } = seedWriting('minecraft:chest', new Set(['minecraft:chest']));
        const chests = written.entities.filter((entity) => entity.request.id === 'minecraft:chest');

        expect(chests.length).toBeGreaterThan(0);
        expect(chests.every((entity) => entity.request.lootTable === 'minecraft:chests/nether_bridge')).toBe(true);
        // A turn's chest backs onto two walls, so `reorient` keeps it off both of them.
        expect(
            written.kept.every((state) => ['north', 'east', 'south', 'west'].includes(state.properties.facing!))
        ).toBe(true);
    });

    it('writes each piece inside its own footprint, with pillars below and two known spills above', () => {
        for (const seed of [7, 99]) {
            for (const piece of layoutAt(seed).pieces) {
                const box = piece.boundingBox;
                const signature = fortressPieceSignature(piece)!;
                let beside = 0;
                const above: string[] = [];
                const writer: StructureWriter = {
                    level: flatNetherrack,
                    blockAt: (x, y, z) => flatNetherrack.baseBlock(x, y, z),
                    setBlock: (x, y, z, state) => {
                        if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) beside++;
                        if (y > box.maxY) above.push(state.name);
                        return true;
                    },
                    setBedrockBlock: () => false,
                    setBlockEntity: () => {},
                    spawnEntity: () => {},
                    heightAt: (heightmap, x, z) => flatNetherrack.baseHeight(x, z, heightmap),
                    hasTag: () => false
                };

                piece.place(writer, createLegacyRandom(BigInt(seed)));
                expect(beside, `seed ${seed}: ${signature} wrote beside its box`).toBe(0);

                // Java declares the throne eight high and writes its top fence row at the ninth,
                // and the stalk room clears air two rows over its roof for the upper exit. The
                // chunk clip lets both through, so a fortress has them too.
                if (signature.startsWith('monster_throne ')) {
                    expect(above, signature).toEqual(Array(3).fill('minecraft:nether_brick_fence'));
                } else if (signature.startsWith('castle_stalk_room ')) {
                    expect(above, signature).toEqual(Array(9).fill('minecraft:air'));
                } else {
                    expect(above, `seed ${seed}: ${signature} wrote above its box`).toEqual([]);
                }
            }
        }
    });

    it('stops a pillar at the first block that is not air or liquid', () => {
        // Every pillar in a flat world reaches exactly from the bridge underside to the ground.
        const columns = new Map<string, number>();
        const writer: StructureWriter = {
            level: flatNetherrack,
            blockAt: (x, y, z) => flatNetherrack.baseBlock(x, y, z),
            setBlock: (x, y, z, state) => {
                if (state.name === 'minecraft:nether_bricks' && y < GROUND + 8) {
                    const key = `${x},${z}`;
                    columns.set(key, Math.min(columns.get(key) ?? y, y));
                }

                return true;
            },
            setBedrockBlock: () => false,
            setBlockEntity: () => {},
            spawnEntity: () => {},
            heightAt: (heightmap, x, z) => flatNetherrack.baseHeight(x, z, heightmap),
            hasTag: () => false
        };

        for (const piece of layoutAt(99).pieces) piece.place(writer, createLegacyRandom(99n));

        expect(columns.size).toBeGreaterThan(0);
        expect(new Set(columns.values())).toEqual(new Set([GROUND]));
    });

    it('lays out the same fortress for one seed and a different one for another', () => {
        expect(signaturesOf(layoutAt(7).pieces)).toEqual(signaturesOf(layoutAt(7).pieces));
        expect(signaturesOf(layoutAt(7).pieces)).not.toEqual(signaturesOf(layoutAt(8).pieces));
    });
});
