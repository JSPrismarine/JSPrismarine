import type { BlockEntityRequest, BlockState, HeightmapType } from '@jsprismarine/features';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildOceanMonument } from './javaStructureOceanMonument';
import type { StructureBuildContext, StructureLayout } from './javaStructureStarts';
import type { StructureLevel, StructureWriter } from './javaStructureWorld';

/** The flat ocean floor every case here is laid out against. */
const FLOOR = 32;

/**
 * Seeds far apart from each other.
 *
 * `java.util.Random` scrambles a seed by one exclusive-or and one step, so two seeds a few apart
 * agree on their first draw. A test that wants two different monuments has to ask for seeds that
 * are actually different.
 */
const SPREAD_SEEDS = [1, 7919, 104_729, 1_299_709, 15_485_863, 179_424_673, 2_038_074_743, 1_111_111_111];

/** Flat stone up to {@link FLOOR} with water over it, which is what a monument stands in. */
const levelOf = (): StructureLevel => ({
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: (_x, _z, heightmap: HeightmapType) => (heightmap === 'OCEAN_FLOOR_WG' ? FLOOR + 1 : 64),
    baseBlock: (_x, y) => ({
        name: y <= FLOOR ? 'minecraft:stone' : y < 63 ? 'minecraft:water' : 'minecraft:air',
        properties: {}
    }),
    noiseBiome: () => 'minecraft:deep_ocean'
});

/** What a writer was asked to do, which is what every assertion here reads. */
interface Written {
    readonly blocks: Map<string, string>;
    readonly entities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
    readonly spawned: { type: string; x: number; y: number; z: number }[];
    readonly writer: StructureWriter;
}

const writerOf = (level: StructureLevel): Written => {
    const blocks = new Map<string, string>();
    const entities: Written['entities'] = [];
    const spawned: Written['spawned'] = [];
    const writer: StructureWriter = {
        level,
        blockAt: (x, y, z) => ({
            name: blocks.get(`${x},${y},${z}`) ?? level.baseBlock(x, y, z).name,
            properties: {}
        }),
        setBlock: (x, y, z, state: BlockState) => {
            blocks.set(`${x},${y},${z}`, state.name);
            return true;
        },
        setBedrockBlock: (x, y, z, state) => {
            blocks.set(`${x},${y},${z}`, state.name);
            return true;
        },
        setBlockEntity: (x, y, z, request) => entities.push({ x, y, z, request }),
        spawnEntity: (type, x, y, z) => spawned.push({ type, x, y, z }),
        heightAt: (heightmap, x, z) => level.baseHeight(x, z, heightmap),
        hasTag: () => false
    };

    return { blocks, entities, spawned, writer };
};

const contextOf = (seed: number, chunkX = 2, chunkZ = -3): StructureBuildContext => ({
    id: 'minecraft:ocean_monument',
    definition: { type: 'minecraft:ocean_monument' },
    chunkX,
    chunkZ,
    seed: BigInt(seed),
    random: createLegacyRandom(seed),
    level: levelOf(),
    // A monument reads no `.nbt` template, so the store never has to answer.
    templates: {
        template: () => undefined,
        prepared: () => undefined,
        size: () => undefined,
        processors: () => []
    },
    pool: () => undefined
});

/** A seed whose monument comes out facing differently from {@link SEED}. */
const OTHER_SEED = 15_485_863;

/** The seed most cases here read, kept in one place because the placements are cached. */
const SEED = 42;

const monumentFor = (seed: number): StructureLayout => buildOceanMonument(contextOf(seed))!;

const placements = new Map<number, Written>();

/** Runs every piece of a seed's monument once and reports what landed. */
const placedFor = (seed: number): Written => {
    const cached = placements.get(seed);
    if (cached !== undefined) return cached;

    const written = writerOf(levelOf());
    const random = createLegacyRandom(7);
    for (const piece of monumentFor(seed).pieces) piece.place(written.writer, random);
    placements.set(seed, written);
    return written;
};

/** Whether two placements wrote the same block in every position. */
const sameBlocks = (one: Written, other: Written): boolean => {
    if (one.blocks.size !== other.blocks.size) return false;

    for (const [position, name] of one.blocks) {
        if (other.blocks.get(position) !== name) return false;
    }

    return true;
};

/** The smallest box holding every piece, which is the whole monument. */
const extentOf = (layout: StructureLayout) => {
    const boxes = layout.pieces.map((piece) => piece.boundingBox);
    return {
        width: Math.max(...boxes.map((box) => box.maxX)) - Math.min(...boxes.map((box) => box.minX)) + 1,
        height: Math.max(...boxes.map((box) => box.maxY)) - Math.min(...boxes.map((box) => box.minY)) + 1,
        depth: Math.max(...boxes.map((box) => box.maxZ)) - Math.min(...boxes.map((box) => box.minZ)) + 1
    };
};

describe('buildOceanMonument', () => {
    it("builds the 58 by 23 by 58 building at Java's fixed y", () => {
        const building = monumentFor(SEED).pieces[0]!.boundingBox;

        expect(building.maxX - building.minX + 1).toBe(58);
        expect(building.maxY - building.minY + 1).toBe(23);
        expect(building.maxZ - building.minZ + 1).toBe(58);
        expect(building.minY).toBe(39);
    });

    it('keeps every room inside the building', () => {
        expect(extentOf(monumentFor(SEED))).toEqual({ width: 58, height: 23, depth: 58 });
    });

    it('centers the building on the start chunk and reports the sea floor as its origin', () => {
        const layout = monumentFor(SEED);
        const building = layout.pieces[0]!.boundingBox;

        expect(building.minX).toBe(2 * 16 - 29);
        expect(building.minZ).toBe(-3 * 16 - 29);
        expect(layout.origin).toEqual({ x: 2 * 16 + 8, y: FLOOR, z: -3 * 16 + 8 });
    });

    it('writes the four prismarine blocks a monument is made of', () => {
        const names = new Set(placedFor(SEED).blocks.values());

        expect(names).toContain('minecraft:prismarine');
        expect(names).toContain('minecraft:prismarine_bricks');
        expect(names).toContain('minecraft:dark_prismarine');
        expect(names).toContain('minecraft:sea_lantern');
    });

    it('hides eight gold blocks in the treasure room', () => {
        const gold = [...placedFor(SEED).blocks.values()].filter((name) => name === 'minecraft:gold_block');

        expect(gold).toHaveLength(8);
    });

    it('grows wet sponges in the sealed rooms', () => {
        const names = new Set(placedFor(SEED).blocks.values());

        expect(names).toContain('minecraft:wet_sponge');
    });

    it('spawns the two wing guardians and the one on the roof', () => {
        expect(placedFor(SEED).spawned.map((entry) => entry.type)).toEqual([
            'minecraft:elder_guardian',
            'minecraft:elder_guardian',
            'minecraft:elder_guardian'
        ]);
    });

    it('cuts the doorways back out of the walls and caps the monument with air', () => {
        const names = new Set(placedFor(SEED).blocks.values());

        // The test level is water everywhere the monument stands, so a flood over bare terrain
        // leaves it alone. Water is written only where a flood reopens a wall the piece just
        // built, and air only above sea level.
        expect(names).toContain('minecraft:water');
        expect(names).toContain('minecraft:air');
    });

    it('lays the same monument out for the same seed', () => {
        const written = writerOf(levelOf());
        const random = createLegacyRandom(7);
        for (const piece of monumentFor(SEED).pieces) piece.place(written.writer, random);

        expect(sameBlocks(written, placedFor(SEED))).toBe(true);
    });

    it('lays a different monument out for a seed far away', () => {
        const boxesOf = (seed: number) => JSON.stringify(monumentFor(seed).pieces.map((piece) => piece.boundingBox));

        expect(boxesOf(OTHER_SEED)).not.toBe(boxesOf(SEED));
        expect(sameBlocks(placedFor(OTHER_SEED), placedFor(SEED))).toBe(false);
    });

    it('turns the monument more than one of the four ways', () => {
        const corners = SPREAD_SEEDS.map((seed) => {
            // The entry room sits in a different corner of the building for each orientation.
            const entry = monumentFor(seed).pieces[1]!.boundingBox;
            return `${entry.minX},${entry.minZ}`;
        });

        expect(new Set(corners).size).toBeGreaterThan(1);
    });
});
