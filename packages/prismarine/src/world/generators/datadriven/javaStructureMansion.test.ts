import type { BlockEntityRequest, BlockState, HeightmapType } from '@jsprismarine/features';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { BoundingBox, JavaStructureTemplate, JavaTemplateBlock } from '@jsprismarine/structures';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildWoodlandMansion } from './javaStructureMansion';
import type { StructureBuildContext, StructureLayout } from './javaStructureStarts';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import { createStructureTemplateStore } from './javaStructureTemplatePiece';
import { createTemplateSource, findJavaTemplates } from './javaStructureTemplates';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';
import { unionOf } from './javaStructureWorld';
import type { TemplateSource } from './javaTemplatePlacement';
import { cacheRoot } from './javaWorldgenData';

/** Terrain high enough for a mansion, which refuses anything under y 60. */
const GROUND = 80;

/**
 * Seeds far apart from each other.
 *
 * `java.util.Random` scrambles a seed by one exclusive-or and one step, so two seeds a few
 * apart agree on their first draw. A test that wants two different mansions has to ask for
 * seeds that are actually different.
 */
const SPREAD_SEEDS = [1, 7919, 104_729, 1_299_709, 15_485_863, 179_424_673, 2_038_074_743, 1_111_111_111];

/** A seed whose mansion has rooms on all three floors. */
const THREE_FLOOR_SEED = 42;

/** The fetched Java templates, if this test process has the real-data corpus. */
const JAVA_TEMPLATE_BYTES = findJavaTemplates(cacheRoot()) ?? new Map<string, Uint8Array>();

/** The real template source shared by the tests that need the corpus. */
const JAVA_TEMPLATE_SOURCE = createTemplateSource(() => JAVA_TEMPLATE_BYTES, new Map());

/** The templates that are not rooms, by the footprint each one really has. */
const FOOTPRINTS: Readonly<Record<string, readonly [number, number]>> = {
    entrance: [21, 16],
    wall_flat: [2, 8],
    wall_window: [2, 8],
    wall_corner: [9, 2],
    small_wall: [2, 8],
    small_wall_corner: [2, 2],
    roof: [8, 8],
    roof_front: [4, 8],
    roof_corner: [4, 4],
    roof_inner_corner: [4, 4],
    corridor_floor: [7, 7],
    carpet_north: [5, 2],
    carpet_east: [2, 5],
    carpet_south_1: [8, 3],
    carpet_south_2: [8, 3],
    carpet_west_1: [3, 8],
    carpet_west_2: [3, 8],
    indoors_wall_1: [1, 8],
    indoors_door_1: [1, 8],
    indoors_wall_2: [1, 8],
    indoors_door_2: [1, 8]
};

/** Mojang's own extents, so two pieces land apart here exactly as far as they do in Java. */
const footprintOf = (name: string): readonly [number, number] => {
    const known = FOOTPRINTS[name];
    if (known !== undefined) return known;
    if (name.startsWith('2x2_')) return [15, 15];
    return name.startsWith('1x2_') ? [7, 15] : [7, 7];
};

/**
 * A template with a real template's extent and two blocks in it.
 *
 * The layout reads a template's declared extent and never its blocks, so filling the box would
 * only make the test slower.
 */
const template = (name: string, marker?: string): JavaStructureTemplate => {
    const [sizeX, sizeZ] = footprintOf(name);
    const sizeY = 8;
    const blocks: JavaTemplateBlock[] = [
        { pos: [0, 0, 0], state: 0 },
        { pos: [sizeX - 1, sizeY - 1, sizeZ - 1], state: 0 }
    ];

    if (marker !== undefined) {
        const nbt = new NBTTagCompound();
        nbt.addValue('mode', new Types.StringVal('DATA'));
        nbt.addValue('metadata', new Types.StringVal(marker));
        blocks.push({ pos: [0, 1, 0], state: 1, nbt });
    }

    return {
        size: [sizeX, sizeY, sizeZ],
        palette: [
            { name: 'minecraft:dark_oak_planks', properties: {} },
            { name: 'minecraft:structure_block', properties: { mode: 'data' } }
        ],
        blocks,
        entities: [],
        paletteKeySpelling: 'id'
    };
};

const PREFIX = 'minecraft:woodland_mansion/';

/** A source that answers every mansion template and nothing else. */
const sourceOf = (marker?: string): TemplateSource => ({
    template: (identifier) =>
        identifier.startsWith(PREFIX) ? template(identifier.slice(PREFIX.length), marker) : undefined,
    processorList: () => undefined
});

/** A store that reports which template each piece is made of as the piece places. */
interface Recorder {
    readonly store: StructureTemplateStore;
    /** The identifiers prepared since the list was last emptied. */
    readonly prepared: string[];
}

const recorderOf = (source: TemplateSource): Recorder => {
    const store = createStructureTemplateStore(source);
    const prepared: string[] = [];

    return {
        prepared,
        store: {
            template: (identifier) => store.template(identifier),
            prepared: (identifier, placement) => {
                prepared.push(identifier);
                return store.prepared(identifier, placement);
            },
            size: (identifier, placement) => store.size(identifier, placement),
            processors: (reference) => store.processors(reference),
            javaBlockOf: (identifier, nbt) => store.javaBlockOf(identifier, nbt)
        }
    };
};

/** Flat stone terrain with its surface at a given y. */
const levelOf = (surface = GROUND): StructureLevel => ({
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: (_x: number, _z: number, _heightmap: HeightmapType) => surface + 1,
    baseBlock: (_x, y) => ({ name: y <= surface ? 'minecraft:stone' : 'minecraft:air', properties: {} }),
    noiseBiome: () => 'minecraft:dark_forest'
});

/** What a writer was asked to do, which is what every assertion here reads. */
interface Written {
    readonly blocks: Map<string, string>;
    /** The Java states a piece wrote itself, which is how a chest's facing arrives. */
    readonly states: BlockState[];
    readonly entities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
    readonly mobs: { type: string; x: number; y: number; z: number }[];
    readonly writer: StructureWriter;
}

const writerOf = (level: StructureLevel): Written => {
    const blocks = new Map<string, string>();
    const states: BlockState[] = [];
    const entities: Written['entities'] = [];
    const mobs: Written['mobs'] = [];
    const writer: StructureWriter = {
        level,
        blockAt: (x, y, z) => ({
            name: blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? 'minecraft:stone' : 'minecraft:air'),
            properties: {}
        }),
        setBlock: (x, y, z, state: BlockState) => {
            blocks.set(`${x},${y},${z}`, state.name);
            states.push(state);
            return true;
        },
        setBedrockBlock: (x, y, z, state) => {
            blocks.set(`${x},${y},${z}`, state.name);
            return true;
        },
        setBlockEntity: (x, y, z, request) => entities.push({ x, y, z, request }),
        spawnEntity: (type, x, y, z) => mobs.push({ type, x, y, z }),
        heightAt: (heightmap, x, z) => level.baseHeight(x, z, heightmap),
        hasTag: () => false
    };

    return { blocks, states, entities, mobs, writer };
};

const contextOf = (store: StructureTemplateStore, seed: number, level = levelOf()): StructureBuildContext => ({
    id: 'minecraft:mansion',
    definition: { type: 'minecraft:woodland_mansion' },
    chunkX: 3,
    chunkZ: -5,
    seed: BigInt(seed),
    random: createLegacyRandom(seed),
    level,
    templates: store,
    pool: () => undefined
});

/** One mansion laid out, with its deferred pieces assembled once. */
interface Mansion {
    readonly origin: StructureLayout['origin'];
    readonly pieces: readonly StructurePiece[];
}

/**
 * A layout with its deferred pieces assembled.
 *
 * Assembling draws from the context's stream, so every case here assembles once and reads the
 * result, the way `StructureStartSource` does after the biome check.
 */
const laidOut = (layout: StructureLayout | undefined): Mansion | undefined =>
    layout === undefined ? undefined : { origin: layout.origin, pieces: layout.pieces() };

/** Lays a mansion out and reports the template each of its pieces names, in piece order. */
const namesOf = (layout: Mansion, recorder: Recorder): string[] => {
    const written = writerOf(levelOf());
    return layout.pieces.map((piece) => {
        recorder.prepared.length = 0;
        piece.place(written.writer, createLegacyRandom(7));
        // A template piece prepares exactly the one template it is made of.
        return recorder.prepared[0] ?? '';
    });
};

/** Lays a mansion out with the fake templates, failing the test when the site is refused. */
const mansionAt = (seed: number, marker?: string): { layout: Mansion; names: string[] } => {
    const recorder = recorderOf(sourceOf(marker));
    const built = buildWoodlandMansion(contextOf(recorder.store, seed));

    expect(built, `seed ${seed} laid out no mansion`).toBeDefined();
    const layout: Mansion = { origin: built!.origin, pieces: built!.pieces() };
    return { layout, names: namesOf(layout, recorder) };
};

const overlap = (left: BoundingBox, right: BoundingBox): boolean =>
    left.minX <= right.maxX &&
    left.maxX >= right.minX &&
    left.minY <= right.maxY &&
    left.maxY >= right.minY &&
    left.minZ <= right.maxZ &&
    left.maxZ >= right.minZ;

/** The room pieces of a layout, grouped by the floor they stand on. */
const roomsByFloor = (layout: Mansion, names: readonly string[]): Map<number, StructurePiece[]> => {
    const floors = new Map<number, StructurePiece[]>();
    for (const [index, piece] of layout.pieces.entries()) {
        if (!/\/(?:1x1|1x2|2x2)_/.test(names[index] ?? '')) continue;

        const floor = floors.get(piece.boundingBox.minY);
        if (floor === undefined) floors.set(piece.boundingBox.minY, [piece]);
        else floor.push(piece);
    }

    return floors;
};

describe('buildWoodlandMansion', () => {
    it('refuses a site whose terrain is below y 60', () => {
        const recorder = recorderOf(sourceOf());

        expect(buildWoodlandMansion(contextOf(recorder.store, 42, levelOf(59)))).toBeUndefined();
        expect(buildWoodlandMansion(contextOf(recorder.store, 42, levelOf(60)))).toBeDefined();
    });

    it('stands the whole mansion on the terrain under its start', () => {
        const { layout } = mansionAt(THREE_FLOOR_SEED);

        expect(layout.origin).toEqual({ x: 3 * 16 + 7, y: GROUND, z: -5 * 16 + 7 });
        // Settled once during layout, so the entrance and the rooms share one floor level.
        expect(Math.min(...layout.pieces.map((piece) => piece.boundingBox.minY))).toBe(GROUND);
    });

    it('stamps a turned piece so its own zero block lands where Java puts it', () => {
        // Where west points once the mansion is turned, by the quarter turns it was turned.
        const west = [
            { x: -1, z: 0 },
            { x: 0, z: -1 },
            { x: 1, z: 0 },
            { x: 0, z: 1 }
        ];

        for (const seed of SPREAD_SEEDS) {
            const recorder = recorderOf(sourceOf());
            const layout = laidOut(buildWoodlandMansion(contextOf(recorder.store, seed)))!;
            const written = writerOf(levelOf());
            recorder.prepared.length = 0;
            layout.pieces[0]!.place(written.writer, createLegacyRandom(7));

            expect(recorder.prepared[0]).toBe(`${PREFIX}entrance`);
            // Java stands the entrance nine blocks west of the generation point, in the mansion's
            // own west, and a mansion's turn is the first draw of its random.
            const turn = west[createLegacyRandom(seed).nextInt(4)]!;
            const zero = `${layout.origin.x + turn.x * 9},${layout.origin.y},${layout.origin.z + turn.z * 9}`;
            expect(written.blocks.size, `seed ${seed}`).toBe(2);
            expect([...written.blocks.keys()], `seed ${seed}`).toContain(zero);
        }
    });

    it('builds the mansion out of mansion templates and nothing else', () => {
        const { names } = mansionAt(THREE_FLOOR_SEED);

        expect(names.length).toBeGreaterThan(50);
        expect(names.every((name) => name.startsWith(PREFIX))).toBe(true);
    });

    it('lays out an entrance, outer walls, a roof, corridors and rooms', () => {
        const { names } = mansionAt(THREE_FLOOR_SEED);
        const bare = new Set(names.map((name) => name.slice(PREFIX.length)));

        expect(bare).toContain('entrance');
        expect(bare).toContain('corridor_floor');
        expect([...bare].some((name) => name.startsWith('wall_'))).toBe(true);
        expect([...bare].some((name) => name.startsWith('roof'))).toBe(true);
        expect([...bare].some((name) => name.startsWith('indoors_'))).toBe(true);
        expect([...bare].some((name) => name.startsWith('1x1_'))).toBe(true);
    });

    it('puts rooms on three floors', () => {
        const { layout, names } = mansionAt(THREE_FLOOR_SEED);
        const floors = [...roomsByFloor(layout, names).keys()].sort((left, right) => left - right);

        // The two lower floors are eight blocks apart and the third sits three blocks higher
        // than another storey would.
        expect(floors).toEqual([GROUND, GROUND + 8, GROUND + 19]);
    });

    it('never overlaps two rooms of the same floor', () => {
        for (const seed of SPREAD_SEEDS) {
            const { layout, names } = mansionAt(seed);
            for (const [floor, rooms] of roomsByFloor(layout, names)) {
                for (const [index, room] of rooms.entries()) {
                    for (const other of rooms.slice(index + 1)) {
                        expect(
                            overlap(room.boundingBox, other.boundingBox),
                            `two rooms of floor ${floor} overlap for seed ${seed}`
                        ).toBe(false);
                    }
                }
            }
        }
    });

    it('lays the same mansion out for one seed and different ones for others', () => {
        const planOf = (seed: number): string => {
            const { layout, names } = mansionAt(seed);
            return JSON.stringify(layout.pieces.map((piece, index) => [names[index], piece.boundingBox]));
        };

        expect(planOf(THREE_FLOOR_SEED)).toBe(planOf(THREE_FLOOR_SEED));
        expect(new Set(SPREAD_SEEDS.map(planOf)).size).toBe(SPREAD_SEEDS.length);
    });

    it('gives every chest the mansion loot table and the facing its marker names', () => {
        const recorder = recorderOf(sourceOf('ChestEast'));
        const layout = laidOut(buildWoodlandMansion(contextOf(recorder.store, THREE_FLOOR_SEED)))!;
        const written = writerOf(levelOf());
        for (const piece of layout.pieces) piece.place(written.writer, createLegacyRandom(7));

        const chests = written.entities.filter((entry) => entry.request.id === 'minecraft:chest');
        expect(chests.length).toBeGreaterThan(0);
        expect(chests.every((entry) => entry.request.lootTable === 'minecraft:chests/woodland_mansion')).toBe(true);
        // A marker whose spot already holds a chest is left alone, so two pieces sharing a block
        // write one chest between them.
        expect(new Set(chests.map((entry) => `${entry.x},${entry.y},${entry.z}`)).size).toBe(chests.length);

        const facings = new Set(
            written.states.filter((state) => state.name === 'minecraft:chest').map((state) => state.properties.facing)
        );
        expect(facings.size).toBeGreaterThan(0);
        expect([...facings].every((facing) => ['north', 'east', 'south', 'west'].includes(facing ?? ''))).toBe(true);
    });

    it('stands an illager on the spot its marker names', () => {
        const recorder = recorderOf(sourceOf('Warrior'));
        const layout = laidOut(buildWoodlandMansion(contextOf(recorder.store, THREE_FLOOR_SEED)))!;
        const written = writerOf(levelOf());
        for (const piece of layout.pieces) piece.place(written.writer, createLegacyRandom(7));

        expect(written.mobs.length).toBe(layout.pieces.length);
        expect(written.mobs.every((mob) => mob.type === 'minecraft:vindicator')).toBe(true);
    });

    it('spawns one to three allays for a flock marker', () => {
        const recorder = recorderOf(sourceOf('Group of Allays'));
        const layout = laidOut(buildWoodlandMansion(contextOf(recorder.store, THREE_FLOOR_SEED)))!;
        const written = writerOf(levelOf());
        for (const piece of layout.pieces) piece.place(written.writer, createLegacyRandom(7));

        const perPiece = written.mobs.length / layout.pieces.length;
        expect(written.mobs.every((mob) => mob.type === 'minecraft:allay')).toBe(true);
        expect(perPiece).toBeGreaterThanOrEqual(1);
        expect(perPiece).toBeLessThanOrEqual(3);
    });
});

/**
 * Against Mojang's own templates, which is what catches a template name this file spells wrong.
 *
 * Gated, because it reads the structure templates the fetch extracts from the server jar:
 *
 * ```sh
 * pnpm exec vitest run src/world/generators/datadriven/javaStructureMansion.test.ts
 * ```
 */
describe.skipIf(JAVA_TEMPLATE_BYTES.size === 0)(
    'the mansion against the real templates',
    { tags: ['real-data'] },
    () => {
        it('names only templates this server carries', () => {
            const named = new Set(SPREAD_SEEDS.flatMap((seed) => mansionAt(seed).names));

            // Eight mansions between them draw most of the room collections.
            expect(named.size).toBeGreaterThan(30);
            expect([...named].filter((identifier) => JAVA_TEMPLATE_SOURCE.template(identifier) === undefined)).toEqual(
                []
            );
        });

        it('composes the real templates into one building of the size a mansion has', () => {
            const store = createStructureTemplateStore(JAVA_TEMPLATE_SOURCE);
            const layout = laidOut(buildWoodlandMansion(contextOf(store, THREE_FLOOR_SEED)))!;
            const box = unionOf(layout.pieces);

            expect(layout.pieces.length).toBeGreaterThan(100);
            // Nothing hangs below the generation point, and the 11 by 11 grid of 8 block cells
            // bounds how far a mansion can reach.
            expect(box.minY).toBe(layout.origin.y);
            expect(box.maxX - box.minX + 1).toBeLessThanOrEqual(11 * 8 + 8);
            expect(box.maxZ - box.minZ + 1).toBeLessThanOrEqual(11 * 8 + 8);
            // Two storeys, the third floor nineteen blocks up and its roof over that.
            expect(box.maxY - box.minY + 1).toBe(31);
        });
    }
);
