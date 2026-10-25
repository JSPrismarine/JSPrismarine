/**
 * The four hand-built structures, against a flat fake world.
 *
 * Nothing here reads Mojang's data. The level is flat terrain at one height and one biome, and
 * the writer records every block and block entity, which is enough to check that a builder lays
 * a piece out where it says it does and that placing it writes the blocks that identify the
 * structure.
 */
import type { BlockEntityRequest, BlockState } from '@jsprismarine/features';
import type { TemplatePosition } from '@jsprismarine/structures';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildBuriedTreasure, buildDesertPyramid, buildJungleTemple, buildSwampHut } from './javaStructureScattered';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import type { StructureBuildContext, StructureBuilder } from './javaStructureStarts';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';

/** The y the fake terrain sits at, high enough that a pyramid's chamber stays above the floor. */
const SURFACE = 70;

const AIR: BlockState = { name: 'minecraft:air', properties: {} };
const STONE: BlockState = { name: 'minecraft:stone', properties: {} };
const GRAVEL: BlockState = { name: 'minecraft:gravel', properties: {} };
const WATER: BlockState = { name: 'minecraft:water', properties: {} };

/**
 * Four seeds, one for each direction a piece can be built along.
 *
 * `java.util.Random` scrambles its seed so little on the first draw that every seed from 0 to
 * 1999 gives the same `nextInt(4)`, so neighboring seeds are no use for telling two layouts
 * apart. These four are spread far enough to cover all four directions.
 */
const SEEDS: Readonly<Record<'north' | 'east' | 'south' | 'west', number>> = {
    north: 79_784,
    east: 19_946,
    south: 0,
    west: 9973
};

/** A world of flat stone up to {@link SURFACE}, one biome everywhere. */
const flatLevel = (): StructureLevel => ({
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: () => SURFACE,
    baseBlock: (_x, y) => (y < SURFACE ? STONE : AIR),
    noiseBiome: () => 'minecraft:desert'
});

/** Terrain that steps down four blocks west of x = 8, so a piece has to reach for the ground. */
const steppedLevel = (): StructureLevel => {
    const heightAt = (x: number): number => (x < 8 ? SURFACE - 4 : SURFACE);

    return {
        ...flatLevel(),
        baseHeight: (x) => heightAt(x),
        baseBlock: (x, y) => (y < heightAt(x) ? STONE : AIR)
    };
};

/** A sea floor with four blocks of gravel over the stone, under water. */
const seabedLevel = (): StructureLevel => ({
    ...flatLevel(),
    baseBlock: (_x, y) => (y >= SURFACE ? WATER : y >= SURFACE - 4 ? GRAVEL : STONE)
});

/** A template store with nothing in it, because none of these four reads a template. */
const emptyTemplates = (): StructureTemplateStore => ({
    template: () => undefined,
    prepared: () => undefined,
    size: (): TemplatePosition | undefined => undefined,
    processors: () => []
});

/** What a recording writer collected. */
interface Recording {
    readonly writer: StructureWriter;
    /** Every block written, keyed by `x,y,z`, last write winning the way a real write does. */
    readonly blocks: Map<string, BlockState>;
    readonly blockEntities: Map<string, BlockEntityRequest>;
    readonly entities: { type: string; x: number; y: number; z: number }[];
}

const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** A writer that keeps everything and drops nothing, so a whole piece lands in one place. */
const recordingWriter = (level: StructureLevel): Recording => {
    const blocks = new Map<string, BlockState>();
    const blockEntities = new Map<string, BlockEntityRequest>();
    const entities: { type: string; x: number; y: number; z: number }[] = [];

    const blockAt = (x: number, y: number, z: number): BlockState =>
        blocks.get(keyOf(x, y, z)) ?? level.baseBlock(x, y, z);

    return {
        blocks,
        blockEntities,
        entities,
        writer: {
            level,
            blockAt,
            setBlock: (x, y, z, state) => {
                blocks.set(keyOf(x, y, z), state);
                return true;
            },
            setBedrockBlock: () => true,
            setBlockEntity: (x, y, z, request) => {
                blockEntities.set(keyOf(x, y, z), request);
            },
            spawnEntity: (type, x, y, z) => {
                entities.push({ type, x, y, z });
            },
            heightAt: (heightmap, x, z) => level.baseHeight(x, z, heightmap),
            hasTag: () => false
        }
    };
};

/** What a case varies about the world a structure is laid out in. */
interface BuildOptions {
    readonly chunkX?: number;
    readonly chunkZ?: number;
    readonly level?: StructureLevel;
}

const contextFor = (seed: number, options: BuildOptions = {}): StructureBuildContext => ({
    id: 'minecraft:test',
    definition: {},
    chunkX: options.chunkX ?? 0,
    chunkZ: options.chunkZ ?? 0,
    seed: BigInt(seed),
    random: createLegacyRandom(seed),
    level: options.level ?? flatLevel(),
    templates: emptyTemplates(),
    pool: () => undefined
});

/** Lays a structure out and writes it, which is what every case below starts from. */
/**
 * A builder's layout with its deferred pieces assembled.
 *
 * Assembling draws from the context's stream, so every case here assembles once and reads the
 * result, the way `StructureStartSource` does after the biome check.
 */
const laidOut = (builder: StructureBuilder, seed: number, options: BuildOptions = {}) => {
    const layout = builder(contextFor(seed, options));
    if (layout === undefined) throw new Error('the builder laid out nothing');
    return { origin: layout.origin, pieces: layout.pieces() };
};

const placed = (
    builder: StructureBuilder,
    seed: number,
    options: BuildOptions = {}
): Recording & { pieces: readonly StructurePiece[] } => {
    const layout = laidOut(builder, seed, options);

    const recording = recordingWriter(options.level ?? flatLevel());
    for (const piece of layout.pieces) piece.place(recording.writer, createLegacyRandom(seed));

    return { ...recording, pieces: layout.pieces };
};

/** The identifiers a recording holds, which is what the "is this the right structure" checks read. */
const identifiers = (recording: Recording): Set<string> =>
    new Set([...recording.blocks.values()].map((state) => state.name));

/** The written blocks as a sorted list of `x,y,z=state`, for comparing two seeds. */
const fingerprint = (recording: Recording): string[] =>
    [...recording.blocks.entries()]
        .map(([at, state]) => `${at}=${state.name}[${Object.entries(state.properties).sort().join(',')}]`)
        .sort();

describe('the desert pyramid', () => {
    it('lays out a 21 by 21 piece settled on the terrain', () => {
        const layout = laidOut(buildDesertPyramid, 42);
        const box = layout.pieces[0]!.boundingBox;

        expect(box.maxX - box.minX).toBe(20);
        expect(box.maxZ - box.minZ).toBe(20);
        expect(box.maxY - box.minY).toBe(14);
        expect(box.minY).toBe(SURFACE);
        // Java's generation point is the middle of the chunk, read off `WORLD_SURFACE_WG`.
        expect(layout.origin).toEqual({ x: 8, y: SURFACE, z: 8 });
    });

    it('writes the sandstone shell and the chiseled frame around the door', () => {
        const names = identifiers(placed(buildDesertPyramid, 42));

        expect(names).toContain('minecraft:sandstone');
        expect(names).toContain('minecraft:chiseled_sandstone');
        expect(names).toContain('minecraft:cut_sandstone');
        expect(names).toContain('minecraft:sandstone_stairs');
    });

    it('writes the trap: a pressure plate over nine TNT, with terracotta marking the spot', () => {
        const recording = placed(buildDesertPyramid, 42);
        const names = identifiers(recording);

        expect(names).toContain('minecraft:stone_pressure_plate');
        expect(names).toContain('minecraft:orange_terracotta');
        expect(names).toContain('minecraft:blue_terracotta');

        const tnt = [...recording.blocks.values()].filter((state) => state.name === 'minecraft:tnt');
        expect(tnt).toHaveLength(9);
    });

    it('gives its four chests the desert pyramid loot table', () => {
        const recording = placed(buildDesertPyramid, 42);
        const chests = [...recording.blockEntities.values()].filter((request) => request.id === 'minecraft:chest');

        expect(chests).toHaveLength(4);
        for (const chest of chests) expect(chest.lootTable).toBe('minecraft:chests/desert_pyramid');
    });

    it('stands the four chests on the chamber floor the pressure plate sits on', () => {
        const recording = placed(buildDesertPyramid, 42);
        const marker = [...recording.blocks.entries()].find(
            ([, state]) => state.name === 'minecraft:stone_pressure_plate'
        )!;
        const plateY = Number(marker[0].split(',')[1]);

        for (const at of recording.blockEntities.keys()) expect(Number(at.split(',')[1])).toBe(plateY);
    });
});

describe('the jungle temple', () => {
    it('lays out a 12 by 15 piece settled on the terrain', () => {
        const layout = laidOut(buildJungleTemple, 7);
        const box = layout.pieces[0]!.boundingBox;
        const footprint = [box.maxX - box.minX + 1, box.maxZ - box.minZ + 1].sort((a, b) => a - b);

        // The depth runs along whichever direction the piece drew, so the footprint is 12 by 15
        // either way around.
        expect(footprint).toEqual([12, 15]);
        expect(box.maxY - box.minY).toBe(9);
        expect(box.minY).toBe(SURFACE);
        expect(layout.origin).toEqual({ x: 8, y: SURFACE, z: 8 });
    });

    it('writes the cobblestone the temple is built out of', () => {
        const names = identifiers(placed(buildJungleTemple, 7));

        expect(names).toContain('minecraft:cobblestone');
        expect(names).toContain('minecraft:mossy_cobblestone');
        expect(names).toContain('minecraft:cobblestone_stairs');
    });

    it('writes the puzzle: three levers, two dispensers and the tripwires that set them off', () => {
        const recording = placed(buildJungleTemple, 7);
        const names = identifiers(recording);

        expect(names).toContain('minecraft:tripwire');
        expect(names).toContain('minecraft:tripwire_hook');
        expect(names).toContain('minecraft:sticky_piston');
        expect(names).toContain('minecraft:redstone_wire');

        const levers = [...recording.blocks.values()].filter((state) => state.name === 'minecraft:lever');
        expect(levers).toHaveLength(3);

        const dispensers = [...recording.blocks.values()].filter((state) => state.name === 'minecraft:dispenser');
        expect(dispensers).toHaveLength(2);
    });

    it('gives the chests and the dispensers their own loot tables', () => {
        const recording = placed(buildJungleTemple, 7);
        const requests = [...recording.blockEntities.values()];

        expect(requests.filter((request) => request.lootTable === 'minecraft:chests/jungle_temple')).toHaveLength(2);
        expect(
            requests.filter((request) => request.lootTable === 'minecraft:chests/jungle_temple_dispenser')
        ).toHaveLength(2);
    });
});

describe('the swamp hut', () => {
    it('lays out a 7 by 9 piece settled on the terrain', () => {
        const layout = laidOut(buildSwampHut, 99);
        const box = layout.pieces[0]!.boundingBox;
        const footprint = [box.maxX - box.minX + 1, box.maxZ - box.minZ + 1].sort((a, b) => a - b);

        expect(footprint).toEqual([7, 9]);
        expect(box.maxY - box.minY).toBe(6);
        expect(box.minY).toBe(SURFACE);
        expect(layout.origin).toEqual({ x: 8, y: SURFACE, z: 8 });
    });

    it('writes the cauldron, the crafting table and the mushroom in the pot', () => {
        const names = identifiers(placed(buildSwampHut, 99));

        expect(names).toContain('minecraft:cauldron');
        expect(names).toContain('minecraft:crafting_table');
        expect(names).toContain('minecraft:potted_red_mushroom');
        expect(names).toContain('minecraft:spruce_planks');
        expect(names).toContain('minecraft:spruce_stairs');
        expect(names).toContain('minecraft:oak_fence');
    });

    it('carries its oak log stilts down to the ground where the terrain drops away', () => {
        // The hut settles on the mean of the stepped terrain, so its west half hangs over a hole
        // the stilts have to reach through.
        const recording = placed(buildSwampHut, 99, { level: steppedLevel() });
        const logs = [...recording.blocks.entries()].filter(([, state]) => state.name === 'minecraft:oak_log');
        const lowest = Math.min(...logs.map(([at]) => Number(at.split(',')[1])));

        expect(lowest).toBe(SURFACE - 4);
    });

    it('puts a witch in it', () => {
        const recording = placed(buildSwampHut, 99);

        expect(recording.entities.map((entity) => entity.type)).toContain('minecraft:witch');
    });
});

describe('buried treasure', () => {
    it('puts its one block nine blocks into the chunk, under the sea floor', () => {
        const layout = laidOut(buildBuriedTreasure, 5, { chunkX: 3, chunkZ: -2 });
        const box = layout.pieces[0]!.boundingBox;

        expect(box.minX).toBe(3 * 16 + 9);
        expect(box.minZ).toBe(-2 * 16 + 9);
        expect(box.maxX).toBe(box.minX);
        expect(box.maxZ).toBe(box.minZ);
        // The fake world is stone right up to the surface, so the walk down stops immediately.
        expect(box.minY).toBe(SURFACE);
        expect(layout.origin).toEqual({ x: 3 * 16 + 8, y: SURFACE, z: -2 * 16 + 8 });
    });

    it('walks down through the sea floor until it finds a block it can bury into', () => {
        const layout = laidOut(buildBuriedTreasure, 5, { level: seabedLevel() });

        // Four blocks of gravel sit over the stone, and gravel is not one Java buries into.
        expect(layout.pieces[0]!.boundingBox.minY).toBe(SURFACE - 4);
    });

    it('writes one chest and gives it the buried treasure loot table', () => {
        const recording = placed(buildBuriedTreasure, 5, { chunkX: 3, chunkZ: -2 });
        const chests = [...recording.blocks.values()].filter((state) => state.name === 'minecraft:chest');

        expect(chests).toHaveLength(1);
        expect([...recording.blockEntities.values()]).toEqual([
            { id: 'minecraft:chest', lootTable: 'minecraft:chests/buried_treasure' }
        ]);
    });

    it('packs sand into the air beside the chest', () => {
        const recording = placed(buildBuriedTreasure, 5, { chunkX: 3, chunkZ: -2 });

        expect(identifiers(recording)).toContain('minecraft:sand');
    });
});

describe('the structure random', () => {
    const builders: readonly (readonly [string, StructureBuilder])[] = [
        ['desert pyramid', buildDesertPyramid],
        ['jungle temple', buildJungleTemple],
        ['swamp hut', buildSwampHut]
    ];

    for (const [name, builder] of builders) {
        it(`gives the same ${name} for the same seed`, () => {
            expect(fingerprint(placed(builder, 1234))).toEqual(fingerprint(placed(builder, 1234)));
        });

        it(`gives a different ${name} for a different seed`, () => {
            const drawn = Object.values(SEEDS).map((seed) => fingerprint(placed(builder, seed)).join('|'));

            expect(new Set(drawn).size).toBe(Object.values(SEEDS).length);
        });
    }
});

describe('the piece facing', () => {
    it('runs the depth along whichever axis the drawn direction points down', () => {
        const footprints = new Map<string, string>();

        for (const [direction, seed] of Object.entries(SEEDS)) {
            const box = laidOut(buildSwampHut, seed).pieces[0]!.boundingBox;
            footprints.set(direction, `${box.maxX - box.minX + 1} by ${box.maxZ - box.minZ + 1}`);
        }

        expect(footprints.get('north')).toBe('7 by 9');
        expect(footprints.get('south')).toBe('7 by 9');
        expect(footprints.get('east')).toBe('9 by 7');
        expect(footprints.get('west')).toBe('9 by 7');
    });

    it('turns the block states with the piece, so a roof edge still faces outward', () => {
        const edges = new Map<string, Set<string>>();

        for (const [direction, seed] of Object.entries(SEEDS)) {
            const recording = placed(buildSwampHut, seed);
            const facings = new Set<string>();
            for (const state of recording.blocks.values()) {
                if (state.name === 'minecraft:spruce_stairs') facings.add(state.properties.facing ?? '');
            }
            edges.set(direction, facings);
        }

        // The hut's four roof edges face four ways whichever direction the piece was built along.
        for (const facings of edges.values()) expect(facings).toEqual(new Set(['north', 'south', 'east', 'west']));
    });
});
