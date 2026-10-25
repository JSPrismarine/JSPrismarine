import type { BlockEntityRequest, BlockState, HeightmapType } from '@jsprismarine/features';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { JavaStructureTemplate, JavaTemplateBlock } from '@jsprismarine/structures';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildIgloo, buildNetherFossil, buildOceanRuin, buildShipwreck } from './javaStructureLegacyTemplates';
import { buildRuinedPortal } from './javaStructureRuinedPortal';
import type { StructureBuildContext, StructureLayout } from './javaStructureStarts';
import { createStructureTemplateStore } from './javaStructureTemplatePiece';
import type { TemplateSource } from './javaTemplatePlacement';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';

/** The flat terrain every case here is laid out against. */
const GROUND = 70;

/**
 * Seeds far apart from each other.
 *
 * `java.util.Random` scrambles a seed by one exclusive-or and one step, so two seeds a few
 * apart agree on their first draw to four decimal places. A test that wants two different
 * structures has to ask for seeds that are actually different.
 */
const SPREAD_SEEDS = [1, 7919, 104_729, 1_299_709, 15_485_863, 179_424_673, 2_038_074_743, 1_111_111_111];

/**
 * A template of one block type filling a box, with an optional data marker in a corner.
 *
 * The builders care about a template's extent, its markers and the states it carries, so one
 * shape with a parameterized size covers every structure in this file.
 */
const template = (
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    block: string,
    marker?: string
): JavaStructureTemplate => {
    const blocks: JavaTemplateBlock[] = [];
    for (let x = 0; x < sizeX; x++) {
        for (let y = 0; y < sizeY; y++) {
            for (let z = 0; z < sizeZ; z++) blocks.push({ pos: [x, y, z], state: 0 });
        }
    }

    if (marker !== undefined) {
        const nbt = new NBTTagCompound();
        nbt.addValue('mode', new Types.StringVal('DATA'));
        nbt.addValue('metadata', new Types.StringVal(marker));
        blocks.push({ pos: [0, sizeY - 1, 0], state: 1, nbt });
    }

    return {
        size: [sizeX, sizeY, sizeZ],
        palette: [
            { name: block, properties: {} },
            { name: 'minecraft:structure_block', properties: { mode: 'data' } }
        ],
        blocks,
        entities: [],
        paletteKeySpelling: 'id'
    };
};

/** A source that answers every identifier with the same shape, so a builder always finds one. */
const sourceOf = (build: (identifier: string) => JavaStructureTemplate | undefined): TemplateSource => ({
    template: build,
    processorList: () => undefined
});

/** Flat terrain of stone up to {@link GROUND}, water above it when the case asks for an ocean. */
const levelOf = (options: { flooded?: boolean; cold?: boolean } = {}): StructureLevel => ({
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: (_x, _z, heightmap: HeightmapType) =>
        options.flooded === true && heightmap !== 'OCEAN_FLOOR_WG' ? 64 : GROUND + 1,
    baseBlock: (_x, y) => ({
        name:
            y <= GROUND ? 'minecraft:stone' : options.flooded === true && y < 64 ? 'minecraft:water' : 'minecraft:air',
        properties: {}
    }),
    noiseBiome: () => 'minecraft:plains',
    coldEnoughToSnow: () => options.cold === true
});

/** What a writer was asked to do, which is what every assertion here reads. */
interface Written {
    readonly blocks: Map<string, string>;
    readonly entities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
    readonly writer: StructureWriter;
}

const writerOf = (level: StructureLevel, existing = 'minecraft:stone'): Written => {
    const blocks = new Map<string, string>();
    const entities: Written['entities'] = [];
    const writer: StructureWriter = {
        level,
        blockAt: (x, y, z) => ({
            name: blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? existing : 'minecraft:air'),
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
        spawnEntity: () => undefined,
        heightAt: (heightmap, x, z) => level.baseHeight(x, z, heightmap),
        hasTag: () => false
    };

    return { blocks, entities, writer };
};

const contextOf = (
    definition: Record<string, unknown>,
    source: TemplateSource,
    seed: number,
    level = levelOf()
): StructureBuildContext => ({
    id: 'minecraft:test',
    definition,
    chunkX: 2,
    chunkZ: -3,
    seed: BigInt(seed),
    random: createLegacyRandom(seed),
    level,
    templates: createStructureTemplateStore(source),
    pool: () => undefined
});

/**
 * A builder's layout with its deferred pieces assembled.
 *
 * Assembling draws from the context's stream, so every case here assembles once and reads the
 * result, the way `StructureStartSource` does after the biome check.
 */
const laidOut = (layout: StructureLayout | undefined) =>
    layout === undefined ? undefined : { origin: layout.origin, pieces: layout.pieces() };

/** Runs every piece of a layout and reports what landed. */
const placed = (layout: { readonly pieces: readonly StructurePiece[] }, level = levelOf()): Written => {
    const written = writerOf(level);
    for (const piece of layout.pieces) piece.place(written.writer, createLegacyRandom(7));
    return written;
};

describe('buildShipwreck', () => {
    const hull = sourceOf(() => template(8, 6, 20, 'minecraft:oak_planks', 'supply_chest'));

    it('sinks an open-water hull onto the ocean floor', () => {
        const layout = laidOut(buildShipwreck(contextOf({ is_beached: false }, hull, 42, levelOf({ flooded: true }))));

        expect(layout).toBeDefined();
        expect(layout!.pieces).toHaveLength(1);
        // The sea floor is flat here, so the average of the footprint is the floor itself.
        expect(layout!.pieces[0]!.boundingBox.minY).toBe(GROUND + 1);
    });

    it('buries a beached hull into the shore rather than resting it on top', () => {
        const layout = laidOut(buildShipwreck(contextOf({ is_beached: true }, hull, 42)));

        expect(layout).toBeDefined();
        expect(layout!.pieces[0]!.boundingBox.minY).toBeLessThan(GROUND + 1);
    });

    it('gives a supply chest its loot table', () => {
        const layout = laidOut(buildShipwreck(contextOf({ is_beached: true }, hull, 42)))!;
        const written = placed(layout);

        expect(written.entities.map((entry) => entry.request.lootTable)).toContain('minecraft:chests/shipwreck_supply');
    });

    it('lays the same hull out for the same seed and turns it differently for others', () => {
        const boxOf = (seed: number) =>
            JSON.stringify(
                laidOut(buildShipwreck(contextOf({ is_beached: false }, hull, seed)))?.pieces[0]?.boundingBox
            );

        expect(boxOf(42)).toBe(boxOf(42));
        expect(new Set(SPREAD_SEEDS.map(boxOf)).size).toBeGreaterThan(1);
    });
});

describe('buildIgloo', () => {
    const igloo = sourceOf((identifier) =>
        identifier === 'minecraft:igloo/top'
            ? template(7, 5, 8, 'minecraft:snow_block', 'chest')
            : template(3, 4, 3, 'minecraft:stone_bricks')
    );

    it('settles the dome onto the surface', () => {
        const layout = laidOut(buildIgloo(contextOf({}, igloo, 11)))!;
        const dome = layout.pieces.at(-1)!;

        expect(layout.origin.y).toBe(GROUND + 1);
        expect(dome.boundingBox.minY).toBe(GROUND);
    });

    it('digs a basement under some igloos and not others', () => {
        const counts = SPREAD_SEEDS.map((seed) => laidOut(buildIgloo(contextOf({}, igloo, seed)))!.pieces.length);

        expect(counts.some((count) => count === 1)).toBe(true);
        expect(counts.some((count) => count > 1)).toBe(true);
    });

    it('gives the basement chest its loot table', () => {
        const withBasement = SPREAD_SEEDS.map((seed) => laidOut(buildIgloo(contextOf({}, igloo, seed)))!).find(
            (layout) => layout.pieces.length > 1
        )!;

        expect(placed(withBasement).entities.map((entry) => entry.request.lootTable)).toContain(
            'minecraft:chests/igloo_chest'
        );
    });
});

describe('buildOceanRuin', () => {
    const ruin = sourceOf(() => template(10, 8, 10, 'minecraft:stone_bricks', 'chest'));

    it('always takes a large ruin when the probability is one', () => {
        const layout = laidOut(
            buildOceanRuin(
                contextOf({ biome_temp: 'warm', large_probability: 1 }, ruin, 5)
                // The template store answers every identifier, so the size is the same either
                // way; the loot table is what the size decides.
            )
        )!;

        expect(placed(layout).entities.map((entry) => entry.request.lootTable)).toContain(
            'minecraft:chests/underwater_ruin_big'
        );
    });

    it('takes a small ruin when the probability is zero', () => {
        const layout = laidOut(buildOceanRuin(contextOf({ biome_temp: 'cold', large_probability: 0 }, ruin, 5)))!;

        expect(placed(layout).entities.map((entry) => entry.request.lootTable)).toContain(
            'minecraft:chests/underwater_ruin_small'
        );
    });

    it('rests the ruin on the lowest column of its footprint', () => {
        const layout = laidOut(buildOceanRuin(contextOf({ biome_temp: 'cold', large_probability: 0 }, ruin, 5)))!;

        expect(layout.pieces[0]!.boundingBox.minY).toBe(GROUND);
    });
});

describe('buildNetherFossil', () => {
    const fossil = sourceOf(() => template(5, 4, 5, 'minecraft:bone_block'));

    it('places the bones at the drawn height and leaves the rock between them', () => {
        const layout = laidOut(
            buildNetherFossil(
                contextOf(
                    {
                        height: {
                            type: 'minecraft:uniform',
                            min_inclusive: { absolute: 40 },
                            max_inclusive: { absolute: 44 }
                        }
                    },
                    fossil,
                    3
                )
            )
        )!;

        expect(layout.pieces).toHaveLength(1);
        expect(layout.origin.y).toBeGreaterThanOrEqual(40);
        expect(layout.origin.y).toBeLessThanOrEqual(44);

        const written = placed(layout);
        expect([...written.blocks.values()]).toContain('minecraft:bone_block');
    });
});

describe('buildRuinedPortal', () => {
    const portal = sourceOf(() => template(8, 6, 8, 'minecraft:obsidian'));

    const setup = (overrides: Record<string, unknown> = {}) => ({
        setups: [
            {
                placement: 'on_land_surface',
                air_pocket_probability: 0,
                mossiness: 0,
                overgrown: false,
                vines: false,
                can_be_cold: false,
                replace_with_blackstone: false,
                weight: 1,
                ...overrides
            }
        ]
    });

    it('rests a surface portal on the terrain and spreads netherrack around it', () => {
        const layout = laidOut(buildRuinedPortal(contextOf(setup(), portal, 17)))!;
        const written = placed(layout);

        expect(layout.pieces).toHaveLength(2);
        expect([...written.blocks.values()]).toContain('minecraft:obsidian');
        expect([...written.blocks.values()]).toContain('minecraft:netherrack');
    });

    it('sinks a partly buried portal below the surface', () => {
        const surface = buildRuinedPortal(contextOf(setup(), portal, 17))!;
        const buried = buildRuinedPortal(contextOf(setup({ placement: 'partly_buried' }), portal, 17))!;

        expect(buried.origin.y).toBeLessThan(surface.origin.y);
    });

    it('draws between two setups rather than always taking the first', () => {
        const both = {
            setups: [
                { ...setup().setups[0], placement: 'underground', weight: 0.5 },
                { ...setup().setups[0], placement: 'on_land_surface', weight: 0.5 }
            ]
        };
        const heights = SPREAD_SEEDS.map((seed) => buildRuinedPortal(contextOf(both, portal, seed))!.origin.y);

        expect(new Set(heights).size).toBeGreaterThan(1);
    });

    it('reports nothing for a structure with no setups', () => {
        expect(buildRuinedPortal(contextOf({}, portal, 17))).toBeUndefined();
    });
});
