import type { BlockEntityRequest, BlockState, HeightmapType } from '@jsprismarine/features';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type {
    BedrockBlockState,
    BoundingBox,
    JavaStructureTemplate,
    JavaTemplateBlock,
    Rotation,
    TemplatePosition
} from '@jsprismarine/structures';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildEndCity } from './javaStructureEndCity';
import type { StructureBuildContext, StructureLayout } from './javaStructureStarts';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import { createStructureTemplateStore } from './javaStructureTemplatePiece';
import { createTemplateSource, findJavaTemplates } from './javaStructureTemplates';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';
import { unionOf } from './javaStructureWorld';
import type { TemplateSource } from './javaTemplatePlacement';
import { cacheRoot } from './javaWorldgenData';

/** An end island high enough for a city, which refuses anything under y 60. */
const GROUND = 70;

/** The chunk every city here starts in. */
const CHUNK = { x: 3, z: -5 };

/**
 * Seeds far apart from each other.
 *
 * `java.util.Random` scrambles a seed by one exclusive-or and one step, so two seeds a few
 * apart agree on their first draw. A test that wants two different cities has to ask for
 * seeds that are actually different.
 */
const SPREAD_SEEDS = [1, 7919, 104_729, 1_299_709, 15_485_863, 179_424_673, 2_038_074_743, 1_111_111_111];

/** The fetched Java templates, if this test process has the real-data corpus. */
const JAVA_TEMPLATE_BYTES = findJavaTemplates(cacheRoot()) ?? new Map<string, Uint8Array>();

/** The real template source shared by the tests that need the corpus. */
const JAVA_TEMPLATE_SOURCE = createTemplateSource(() => JAVA_TEMPLATE_BYTES, new Map());

/** Mojang's own extents, read out of the 26.3 `end_city/*.nbt` files. */
const SIZES: Readonly<Record<string, TemplatePosition>> = {
    base_floor: [10, 4, 10],
    base_roof: [12, 2, 12],
    bridge_end: [5, 6, 2],
    bridge_gentle_stairs: [5, 7, 8],
    bridge_piece: [5, 6, 4],
    bridge_steep_stairs: [5, 7, 4],
    fat_tower_base: [13, 4, 13],
    fat_tower_middle: [13, 8, 13],
    fat_tower_top: [17, 6, 17],
    second_floor_1: [12, 8, 12],
    second_floor_2: [12, 8, 12],
    second_roof: [14, 2, 14],
    ship: [13, 24, 29],
    third_floor_1: [14, 8, 14],
    third_floor_2: [14, 8, 14],
    third_roof: [16, 2, 16],
    tower_base: [7, 7, 7],
    tower_floor: [7, 4, 7],
    tower_piece: [7, 4, 7],
    tower_top: [9, 5, 9]
};

const PREFIX = 'minecraft:end_city/';

/**
 * A template with a real template's extent and two blocks in it.
 *
 * The layout reads a template's declared extent and never its blocks, so filling the box would
 * only make the test slower.
 */
const template = (name: string, marker?: string): JavaStructureTemplate | undefined => {
    const size = SIZES[name];
    if (size === undefined) return undefined;

    const [sizeX, sizeY, sizeZ] = size;
    const blocks: JavaTemplateBlock[] = [
        { pos: [0, 0, 0], state: 0 },
        { pos: [sizeX - 1, sizeY - 1, sizeZ - 1], state: 0 }
    ];

    if (marker !== undefined) {
        const nbt = new NBTTagCompound();
        nbt.addValue('mode', new Types.StringVal('DATA'));
        nbt.addValue('metadata', new Types.StringVal(marker));
        blocks.push({ pos: [1, 1, 1], state: 1, nbt });
    }

    return {
        size,
        palette: [
            { name: 'minecraft:purpur_block', properties: {} },
            { name: 'minecraft:structure_block', properties: { mode: 'data' } }
        ],
        blocks,
        entities: [],
        paletteKeySpelling: 'id'
    };
};

/** A source that answers every end city template and nothing else. */
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

/** A flat end stone island with its surface at a given y, in the End's own bounds. */
const levelOf = (surface = GROUND): StructureLevel => ({
    minY: 0,
    height: 256,
    seaLevel: 0,
    baseHeight: (_x: number, _z: number, _heightmap: HeightmapType) => surface + 1,
    baseBlock: (_x, y) => ({ name: y <= surface ? 'minecraft:end_stone' : 'minecraft:air', properties: {} }),
    noiseBiome: () => 'minecraft:end_highlands'
});

/** What a writer was asked to do, which is what every assertion here reads. */
interface Written {
    readonly blocks: Map<string, string>;
    /** The Bedrock states a piece wrote beside its template, which is how a frame arrives. */
    readonly bedrockStates: { x: number; y: number; z: number; state: BedrockBlockState }[];
    readonly entities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
    readonly mobs: { type: string; x: number; y: number; z: number }[];
    readonly writer: StructureWriter;
}

const writerOf = (level: StructureLevel): Written => {
    const blocks = new Map<string, string>();
    const bedrockStates: Written['bedrockStates'] = [];
    const entities: Written['entities'] = [];
    const mobs: Written['mobs'] = [];
    const writer: StructureWriter = {
        level,
        blockAt: (x, y, z) => ({
            name: blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? 'minecraft:end_stone' : 'minecraft:air'),
            properties: {}
        }),
        setBlock: (x, y, z, state: BlockState) => {
            blocks.set(`${x},${y},${z}`, state.name);
            return true;
        },
        setBedrockBlock: (x, y, z, state) => {
            blocks.set(`${x},${y},${z}`, state.name);
            bedrockStates.push({ x, y, z, state });
            return true;
        },
        setBlockEntity: (x, y, z, request) => entities.push({ x, y, z, request }),
        spawnEntity: (type, x, y, z) => mobs.push({ type, x, y, z }),
        heightAt: (heightmap, x, z) => level.baseHeight(x, z, heightmap),
        hasTag: () => false
    };

    return { blocks, bedrockStates, entities, mobs, writer };
};

const contextOf = (store: StructureTemplateStore, seed: number, level = levelOf()): StructureBuildContext => ({
    id: 'minecraft:end_city',
    definition: { type: 'minecraft:end_city' },
    chunkX: CHUNK.x,
    chunkZ: CHUNK.z,
    seed: BigInt(seed),
    random: createLegacyRandom(seed),
    level,
    templates: store,
    pool: () => undefined
});

/** One city laid out, with its deferred pieces assembled once. */
interface City {
    readonly origin: StructureLayout['origin'];
    readonly pieces: readonly StructurePiece[];
}

/** Lays a city out and reports the template each of its pieces names, in piece order. */
const namesOf = (city: City, recorder: Recorder): string[] => {
    const written = writerOf(levelOf());
    return city.pieces.map((piece) => {
        recorder.prepared.length = 0;
        piece.place(written.writer, createLegacyRandom(7));
        // A template piece prepares exactly the one template it is made of.
        return (recorder.prepared[0] ?? '').slice(PREFIX.length);
    });
};

/** Lays a city out with the fake templates, failing the test when the site is refused. */
const cityAt = (seed: number, marker?: string): { city: City; names: string[]; recorder: Recorder } => {
    const recorder = recorderOf(sourceOf(marker));
    const built = buildEndCity(contextOf(recorder.store, seed));

    expect(built, `seed ${seed} laid out no city`).toBeDefined();
    const city: City = { origin: built!.origin, pieces: built!.pieces() };
    return { city, names: namesOf(city, recorder), recorder };
};

/** Places every piece of a city into one writer. */
const placed = (seed: number, marker: string): Written => {
    const { city } = cityAt(seed, marker);
    const written = writerOf(levelOf());
    for (const piece of city.pieces) piece.place(written.writer, createLegacyRandom(7));
    return written;
};

/** Java's `Rotation.getRandom`, which is the first draw a city makes. */
const rotationDrawn = (seed: number): Rotation =>
    (['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'] as const)[createLegacyRandom(seed).nextInt(4)]!;

/** Java's `BlockPos.rotate`: an offset turned about the origin. */
const rotate = ([x, y, z]: TemplatePosition, rotation: Rotation): TemplatePosition => {
    switch (rotation) {
        case 'clockwise_90':
            return [-z, y, x];
        case 'clockwise_180':
            return [-x, y, -z];
        case 'counterclockwise_90':
            return [z, y, -x];
        default:
            return [x, y, z];
    }
};

/**
 * Java's `StructureTemplate.getBoundingBox` for a template at a position under a rotation about
 * its own zero block, which is how `EndCityPiece` places every template.
 */
const javaBox = (
    [x, y, z]: TemplatePosition,
    [sizeX, sizeY, sizeZ]: TemplatePosition,
    rotation: Rotation
): BoundingBox => {
    const [cornerX, , cornerZ] = rotate([sizeX - 1, 0, sizeZ - 1], rotation);
    return {
        minX: Math.min(x, x + cornerX),
        minY: y,
        minZ: Math.min(z, z + cornerZ),
        maxX: Math.max(x, x + cornerX),
        maxY: y + sizeY - 1,
        maxZ: Math.max(z, z + cornerZ)
    };
};

const add = ([x, y, z]: TemplatePosition, [dx, dy, dz]: TemplatePosition): TemplatePosition => [x + dx, y + dy, z + dz];

/**
 * Seed 42's city, read off the Java algorithm by hand.
 *
 * Its first draw is 2, `CLOCKWISE_180`, so every offset is negated. `startHouseTower` stacks the
 * spine at (+1, 0, +1), (+1, 4, +1) and (+1, 8, +1); the tower generator draws (0, 1) for its
 * base, one extra floor and no bridge; the fat tower skips its `NONE` bridge and keeps the
 * `CLOCKWISE_90` one, whose end turns to `COUNTERCLOCKWISE_90`; that bridge runs a piece, steep
 * stairs and two gentle stairs before a depth 2 house with a `base_roof`, then closes with an end
 * turned `CLOCKWISE_90`. The ship hangs 70 blocks out from a depth 4 bridge. Each box is Java's
 * `getBoundingBox` of the template at that position about its zero block.
 */
const SEED_42_PLAN: readonly (readonly [string, readonly [number, number, number, number, number, number]])[] = [
    ['base_floor', [46, 70, -82, 55, 73, -73]],
    ['second_floor_1', [45, 70, -83, 56, 77, -72]],
    ['third_floor_1', [44, 74, -84, 57, 81, -71]],
    ['third_roof', [43, 82, -85, 58, 83, -70]],
    ['tower_base', [49, 79, -80, 55, 85, -74]],
    ['tower_piece', [49, 86, -80, 55, 89, -74]],
    ['tower_piece', [49, 90, -80, 55, 93, -74]],
    ['fat_tower_base', [46, 94, -83, 58, 97, -71]],
    ['fat_tower_middle', [46, 98, -83, 58, 105, -71]],
    ['fat_tower_middle', [46, 106, -83, 58, 113, -71]],
    ['bridge_end', [46, 105, -79, 47, 110, -75]],
    ['bridge_piece', [42, 105, -79, 45, 110, -75]],
    ['bridge_steep_stairs', [38, 105, -79, 41, 111, -75]],
    ['bridge_gentle_stairs', [30, 109, -79, 37, 115, -75]],
    ['bridge_gentle_stairs', [22, 113, -79, 29, 119, -75]],
    ['base_floor', [11, 118, -81, 20, 121, -72]],
    ['base_roof', [10, 122, -82, 21, 123, -71]],
    ['bridge_end', [21, 117, -79, 22, 122, -75]],
    ['bridge_end', [57, 105, -79, 58, 110, -75]],
    ['bridge_piece', [59, 105, -79, 62, 110, -75]],
    ['bridge_gentle_stairs', [63, 105, -79, 70, 111, -75]],
    ['bridge_steep_stairs', [71, 109, -79, 74, 115, -75]],
    ['bridge_piece', [75, 113, -79, 78, 118, -75]],
    ['bridge_steep_stairs', [79, 113, -79, 82, 119, -75]],
    ['base_floor', [84, 118, -82, 93, 121, -73]],
    ['base_roof', [83, 122, -83, 94, 123, -72]],
    ['bridge_end', [82, 117, -79, 83, 122, -75]],
    ['fat_tower_middle', [46, 114, -83, 58, 121, -71]],
    ['bridge_end', [50, 113, -72, 54, 118, -71]],
    ['bridge_piece', [50, 113, -70, 54, 118, -67]],
    ['bridge_gentle_stairs', [50, 113, -66, 54, 119, -59]],
    ['bridge_piece', [50, 117, -58, 54, 122, -55]],
    ['base_floor', [48, 118, -53, 57, 121, -44]],
    ['second_floor_2', [47, 118, -54, 58, 125, -43]],
    ['third_floor_2', [46, 122, -55, 59, 129, -42]],
    ['third_roof', [45, 130, -56, 60, 131, -41]],
    ['tower_base', [50, 127, -51, 56, 133, -45]],
    ['tower_piece', [50, 134, -51, 56, 137, -45]],
    ['tower_piece', [50, 138, -51, 56, 141, -45]],
    ['tower_piece', [50, 142, -51, 56, 145, -45]],
    ['tower_piece', [50, 146, -51, 56, 149, -45]],
    ['bridge_end', [51, 141, -46, 55, 146, -45]],
    ['bridge_piece', [51, 141, -44, 55, 146, -41]],
    ['bridge_gentle_stairs', [51, 141, -40, 55, 147, -33]],
    ['ship', [45, 145, 3, 57, 168, 31]],
    ['bridge_end', [51, 145, -33, 55, 150, -32]],
    ['bridge_end', [50, 141, -50, 51, 146, -46]],
    ['bridge_piece', [46, 141, -50, 49, 146, -46]],
    ['bridge_steep_stairs', [42, 141, -50, 45, 147, -46]],
    ['bridge_piece', [38, 145, -50, 41, 150, -46]],
    ['bridge_steep_stairs', [34, 145, -50, 37, 151, -46]],
    ['bridge_gentle_stairs', [26, 149, -50, 33, 155, -46]],
    ['base_floor', [15, 154, -52, 24, 157, -43]],
    ['second_floor_2', [14, 154, -53, 25, 161, -42]],
    ['third_floor_2', [13, 158, -54, 26, 165, -41]],
    ['third_roof', [12, 166, -55, 27, 167, -40]],
    ['bridge_end', [25, 153, -50, 26, 158, -46]],
    ['tower_top', [49, 150, -52, 57, 154, -44]],
    ['bridge_end', [50, 117, -55, 54, 122, -54]],
    ['bridge_end', [57, 113, -79, 58, 118, -75]],
    ['bridge_end', [50, 113, -83, 54, 118, -82]],
    ['bridge_piece', [50, 113, -87, 54, 118, -84]],
    ['bridge_gentle_stairs', [50, 113, -95, 54, 119, -88]],
    ['bridge_piece', [50, 117, -99, 54, 122, -96]],
    ['base_floor', [47, 118, -110, 56, 121, -101]],
    ['base_roof', [46, 122, -111, 57, 123, -100]],
    ['bridge_end', [50, 117, -100, 54, 122, -99]],
    ['fat_tower_top', [44, 122, -85, 60, 127, -69]]
];

describe('buildEndCity', () => {
    it('refuses a site whose island is below y 60', () => {
        const recorder = recorderOf(sourceOf());

        expect(buildEndCity(contextOf(recorder.store, 42, levelOf(59)))).toBeUndefined();
        expect(buildEndCity(contextOf(recorder.store, 42, levelOf(60)))).toBeDefined();
    });

    it('starts seven blocks into the chunk, on the lowest corner of the island under it', () => {
        const { city } = cityAt(42);

        expect(city.origin).toEqual({ x: CHUNK.x * 16 + 7, y: GROUND, z: CHUNK.z * 16 + 7 });
    });

    it('stamps the base floor so its own zero block lands on the generation point', () => {
        for (const seed of SPREAD_SEEDS) {
            const { city, recorder } = cityAt(seed);
            const written = writerOf(levelOf());
            recorder.prepared.length = 0;
            city.pieces[0]!.place(written.writer, createLegacyRandom(7));

            expect(recorder.prepared[0]).toBe(`${PREFIX}base_floor`);
            expect(written.blocks.size, `seed ${seed}`).toBe(2);
            expect([...written.blocks.keys()], `seed ${seed}`).toContain(
                `${city.origin.x},${city.origin.y},${city.origin.z}`
            );
        }
    });

    it('stacks the house tower the way `startHouseTower` stacks it, turned as a whole', () => {
        // `startHouseTower`: `second_floor_1` at (-1, 0, -1) from the base floor, `third_floor_1`
        // at (-1, 4, -1) from that and `third_roof` at (-1, 8, -1) from that, each offset turned
        // by the parent's rotation before it is added.
        for (const seed of SPREAD_SEEDS) {
            const { city, names } = cityAt(seed);
            const rotation = rotationDrawn(seed);
            const base: TemplatePosition = [city.origin.x, city.origin.y, city.origin.z];
            const second = add(base, rotate([-1, 0, -1], rotation));
            const third = add(second, rotate([-1, 4, -1], rotation));
            const roof = add(third, rotate([-1, 8, -1], rotation));

            expect(names.slice(0, 4), `seed ${seed}`).toEqual([
                'base_floor',
                'second_floor_1',
                'third_floor_1',
                'third_roof'
            ]);
            expect(city.pieces[0]!.boundingBox, `seed ${seed}`).toEqual(javaBox(base, SIZES.base_floor!, rotation));
            expect(city.pieces[1]!.boundingBox, `seed ${seed}`).toEqual(
                javaBox(second, SIZES.second_floor_1!, rotation)
            );
            expect(city.pieces[2]!.boundingBox, `seed ${seed}`).toEqual(javaBox(third, SIZES.third_floor_1!, rotation));
            expect(city.pieces[3]!.boundingBox, `seed ${seed}`).toEqual(javaBox(roof, SIZES.third_roof!, rotation));
        }
    });

    it('grows a tower off the roof, its base three blocks down and a floor seven blocks up', () => {
        // `TOWER_GENERATOR`: `tower_base` at (3 + nextInt(2), -3, 3 + nextInt(2)) from the roof,
        // then `tower_piece` at (0, 7, 0) from the base. Both keep the parent's rotation.
        for (const seed of SPREAD_SEEDS) {
            const { city, names } = cityAt(seed);
            const rotation = rotationDrawn(seed);
            const roof = city.pieces[3]!.boundingBox;
            const base = city.pieces[4]!.boundingBox;
            const floor = city.pieces[5]!.boundingBox;

            expect(names.slice(4, 6), `seed ${seed}`).toEqual(['tower_base', 'tower_piece']);
            expect(base.minY, `seed ${seed}`).toBe(roof.minY - 3);
            expect(floor.minY, `seed ${seed}`).toBe(base.minY + 7);
            // The base is 7 wide and the floor 7 wide: same column, as (0, 7, 0) says.
            expect([floor.minX, floor.maxX, floor.minZ, floor.maxZ]).toEqual([
                base.minX,
                base.maxX,
                base.minZ,
                base.maxZ
            ]);
            // Three or four blocks in from the roof's own zero corner, in the turned frame.
            const [dx, , dz] = rotate([3, 0, 3], rotation);
            const roofZero = rotation === 'none' || rotation === 'counterclockwise_90' ? roof.minX : roof.maxX;
            const roofZeroZ = rotation === 'none' || rotation === 'clockwise_90' ? roof.minZ : roof.maxZ;
            const baseZero = rotation === 'none' || rotation === 'counterclockwise_90' ? base.minX : base.maxX;
            const baseZeroZ = rotation === 'none' || rotation === 'clockwise_90' ? base.minZ : base.maxZ;
            expect(Math.abs(baseZero - roofZero - dx), `seed ${seed}`).toBeLessThanOrEqual(1);
            expect(Math.abs(baseZeroZ - roofZeroZ - dz), `seed ${seed}`).toBeLessThanOrEqual(1);
        }
    });

    it('builds the city out of end city templates and nothing else', () => {
        for (const seed of SPREAD_SEEDS) {
            const { names } = cityAt(seed);

            expect(names.length, `seed ${seed}`).toBeGreaterThan(5);
            expect(
                names.every((name) => name in SIZES),
                `seed ${seed}`
            ).toBe(true);
        }
    });

    it('lays no more than one ship per city, because the bridge generator remembers one', () => {
        for (const seed of SPREAD_SEEDS) {
            const { names } = cityAt(seed);
            expect(names.filter((name) => name === 'ship').length, `seed ${seed}`).toBeLessThanOrEqual(1);
        }
    });

    it('closes every bridge it keeps with a far end, and may leave a stub where it dropped one', () => {
        // The tower adds the near `bridge_end` to its own batch before the bridge generator runs,
        // so a bridge whose house collided leaves that stub behind. A bridge that was kept has
        // its segments and the far `bridge_end` together, because a batch lands whole or not.
        for (const seed of SPREAD_SEEDS) {
            const { city, names } = cityAt(seed);
            const ends = names.filter((name) => name === 'bridge_end').length;
            const spans = names.filter((name) => name.startsWith('bridge_') && name !== 'bridge_end').length;

            if (spans > 0) expect(ends, `seed ${seed}`).toBeGreaterThanOrEqual(2);
            expect(city.pieces.length).toBe(names.length);
        }
    });

    it('lays seed 42 out piece for piece as the Java generators do', () => {
        const { city, names } = cityAt(42);
        const plan = city.pieces.map((piece, index) => {
            const box = piece.boundingBox;
            return [names[index], [box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ]];
        });

        expect(plan).toEqual(SEED_42_PLAN);
        expect(plan.length).toBe(68);
    });

    it('lays the same city out for one seed and different ones for others', () => {
        const planOf = (seed: number): string => {
            const { city, names } = cityAt(seed);
            return JSON.stringify(city.pieces.map((piece, index) => [names[index], piece.boundingBox]));
        };

        expect(planOf(42)).toBe(planOf(42));
        expect(new Set(SPREAD_SEEDS.map(planOf)).size).toBe(SPREAD_SEEDS.length);
    });

    it('gives the chest below a chest marker the end city treasure table', () => {
        const written = placed(42, 'Chest');

        const chests = written.entities.filter((entry) => entry.request.id === 'minecraft:chest');
        expect(chests.length).toBeGreaterThan(0);
        expect(chests.every((entry) => entry.request.lootTable === 'minecraft:chests/end_city_treasure')).toBe(true);
        // Java fills the block below the marker, which is where the template's chest stands.
        expect(chests.every((entry) => written.blocks.has(`${entry.x},${entry.y + 1},${entry.z}`) === false)).toBe(
            true
        );
    });

    it('stands a shulker in the middle of a sentry marker', () => {
        const { city } = cityAt(42, 'Sentry');
        const written = placed(42, 'Sentry');

        expect(written.mobs.length).toBe(city.pieces.length);
        expect(written.mobs.every((mob) => mob.type === 'minecraft:shulker')).toBe(true);
        expect(written.mobs.every((mob) => Math.abs(mob.x % 1) === 0.5 && Math.abs(mob.z % 1) === 0.5)).toBe(true);
    });

    it('hangs an item frame holding an elytra on an elytra marker, facing the turned south', () => {
        // Java hangs the frame facing `rotation.rotate(SOUTH)` for the piece's own rotation. The
        // base floor is turned the way the city is, so its frame faces the city's south.
        const facings: Record<Rotation, number> = {
            none: 3,
            clockwise_90: 4,
            clockwise_180: 2,
            counterclockwise_90: 5
        };

        for (const seed of SPREAD_SEEDS) {
            const { city } = cityAt(seed, 'Elytra');
            const written = writerOf(levelOf());
            city.pieces[0]!.place(written.writer, createLegacyRandom(7));

            const frames = written.bedrockStates.filter((entry) => entry.state.name === 'minecraft:frame');
            const items = written.entities.filter((entry) => entry.request.id === 'minecraft:item_frame');

            expect(frames.length, `seed ${seed}`).toBe(1);
            expect(frames[0]!.state.states.facing_direction, `seed ${seed}`).toBe(facings[rotationDrawn(seed)]);
            expect(items.length).toBe(1);
            expect([items[0]!.x, items[0]!.y, items[0]!.z]).toEqual([frames[0]!.x, frames[0]!.y, frames[0]!.z]);
            const saved = items[0]!.request.saved;
            if (!(saved instanceof NBTTagCompound)) throw new Error(`seed ${seed}: the elytra frame saved no compound`);
            expect(saved.getCompound('Item', false)?.getString('id', '')).toBe('minecraft:elytra');
        }
    });
});

/**
 * Against Mojang's own templates, which is what catches a template name this file spells wrong.
 *
 * Gated, because it reads the structure templates the fetch extracts from the server jar:
 *
 * ```sh
 * pnpm exec vitest run src/world/generators/datadriven/javaStructureEndCity.test.ts
 * ```
 */
describe.skipIf(JAVA_TEMPLATE_BYTES.size === 0)(
    'the end city against the real templates',
    { tags: ['real-data'] },
    () => {
        it('names only templates this server carries', () => {
            const named = new Set(SPREAD_SEEDS.flatMap((seed) => cityAt(seed).names));

            // Eight cities between them reach every section generator.
            expect(named.size).toBeGreaterThan(10);
            expect(
                [...named].filter((name) => JAVA_TEMPLATE_SOURCE.template(`${PREFIX}${name}`) === undefined)
            ).toEqual([]);
        });

        it('declares the extents this test lays the city out with', () => {
            for (const [name, size] of Object.entries(SIZES)) {
                expect(JAVA_TEMPLATE_SOURCE.template(`${PREFIX}${name}`)?.size, name).toEqual(size);
            }
        });

        it('composes the real templates into one city standing on its generation point', () => {
            const store = createStructureTemplateStore(JAVA_TEMPLATE_SOURCE);
            const built = buildEndCity(contextOf(store, 42))!;
            const pieces = built.pieces();
            const box = unionOf(pieces);

            expect(pieces.length).toBeGreaterThan(5);
            // The base floor sits on the generation point and the towers climb from there.
            expect(box.minY).toBeLessThanOrEqual(built.origin.y);
            expect(box.maxY - built.origin.y).toBeGreaterThan(12);
        });
    }
);
