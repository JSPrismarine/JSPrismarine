/**
 * Templates stamped into a region, through the vanilla `fossil` feature.
 *
 * The templates are hand-built rather than read out of the server jar, so the test says what a
 * rotation and a processor list are supposed to do to a known block instead of asserting against
 * whatever Mojang shipped. `javaTemplate.test.ts` in `@jsprismarine/structures` covers reading
 * the real files.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import type { TemplateProcessors } from '@jsprismarine/features';
import { WorldgenRandom, fossil } from '@jsprismarine/features';
import { ByteOrder, NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';
import { createTemplateSource } from './javaStructureTemplates';
import type { TemplateSource } from './javaTemplatePlacement';

const SEED = 99n;
const STONE = { name: 'minecraft:stone', properties: {} };

type Tag = NBTTagCompound | Set<unknown> | Types.StringVal | Types.NumberVal;

const int = (value: number) => new Types.NumberVal(value);
const str = (value: string) => new Types.StringVal(value);
const triple = (x: number, y: number, z: number) => new Set([int(x), int(y), int(z)]);

const compound = (children: Record<string, Tag>, name = ''): NBTTagCompound => {
    const tag = new NBTTagCompound(name);
    for (const [key, value] of Object.entries(children)) {
        if (value instanceof NBTTagCompound) value.setName(key);
        tag.addValue(key, value);
    }
    return tag;
};

const encode = (root: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    root.writeToStream(stream, ByteOrder.BIG_ENDIAN);
    return stream.getBuffer();
};

/**
 * A two by one by one template: a bone block lying along x, then a coal ore beside it.
 *
 * The bone block's axis is what a quarter turn has to change, and the coal ore is what the
 * fossil's overlay processor replaces.
 */
const boneTemplate = () =>
    encode(
        compound({
            DataVersion: int(5023),
            size: triple(2, 1, 1),
            palette: new Set([
                compound({ id: str('minecraft:bone_block'), properties: compound({ axis: str('x') }) }),
                compound({ id: str('minecraft:coal_ore') })
            ]),
            blocks: new Set([
                compound({ pos: triple(0, 0, 0), state: int(0) }),
                compound({ pos: triple(1, 0, 0), state: int(1) })
            ]),
            entities: new Set([])
        })
    );

/**
 * One suspicious sand carrying the block entity the file saves on it.
 *
 * This is the shape of `minecraft:desert_well/suspicious_sand`: a single block whose compound
 * names its type and holds nothing else worth brushing until a rule appends a loot table.
 */
const sandTemplate = () =>
    encode(
        compound({
            DataVersion: int(5023),
            size: triple(1, 1, 1),
            palette: new Set([compound({ id: str('minecraft:suspicious_sand') })]),
            blocks: new Set([
                compound({
                    pos: triple(0, 0, 0),
                    state: int(0),
                    nbt: compound({ id: str('minecraft:brushable_block') })
                })
            ]),
            entities: new Set([])
        })
    );

/** The desert well's own rule, which hands its suspicious sand the archaeology table. */
const ARCHAEOLOGY = {
    processors: [
        {
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:suspicious_sand' },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:suspicious_sand',
                    block_entity_modifier: {
                        type: 'minecraft:append_loot',
                        loot_table: 'minecraft:archaeology/desert_well'
                    }
                }
            ]
        }
    ]
};

const source = (processorLists: Record<string, unknown> = {}): TemplateSource =>
    createTemplateSource(
        () =>
            new Map([
                ['minecraft:fossil/spine_1', boneTemplate()],
                ['minecraft:desert_well/suspicious_sand', sandTemplate()]
            ]),
        new Map(Object.entries(processorLists))
    );

const region = (templates?: TemplateSource): GenerationRegion =>
    new GenerationRegion({
        chunkX: 0,
        chunkZ: 0,
        minY: -64,
        height: 384,
        seaLevel: 63,
        seed: SEED,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains',
        ...(templates === undefined ? {} : { templates })
    });

/** Fills the window with stone, so the fossil has something to be buried in. */
const fillStone = (built: GenerationRegion): void => {
    for (let x = -16; x < 32; x++) {
        for (let z = -16; z < 32; z++) {
            for (let y = 0; y <= 63; y++) built.write(x, y, z, STONE);
        }
    }
};

/** The one position in the center chunk holding a block out of the template. */
const templateBlocks = (built: GenerationRegion) => {
    const found: { x: number; y: number; z: number; name: string; states: Record<string, string | number> }[] = [];
    built.forEachCenterBlock((localX, y, localZ, block) => {
        if (block.bedrock === undefined) return;

        found.push({ x: localX, y, z: localZ, name: block.bedrock.name, states: { ...block.bedrock.states } });
    });
    return found;
};

const placeFossil = (built: GenerationRegion, processors = 'minecraft:empty', overlay = 'minecraft:empty'): boolean =>
    fossil(['minecraft:fossil/spine_1'], ['minecraft:fossil/spine_1'], processors, overlay, 4).place(
        built.featureWorld(),
        new WorldgenRandom(SEED),
        { x: 8, y: 63, z: 8 }
    );

describe('placeTemplate', () => {
    it('buries a fossil as the Bedrock states the template reader resolved', () => {
        const built = region(source());
        fillStone(built);

        expect(placeFossil(built)).toBe(true);

        const placed = templateBlocks(built);
        expect(placed.map((block) => block.name).sort()).toEqual(['minecraft:bone_block', 'minecraft:coal_ore']);
        // Java buries the fossil between 10 and 25 blocks under the column's floor.
        for (const block of placed) expect(block.y).toBeLessThan(63);
    });

    it('turns the direction-valued states with the template', () => {
        const axes = new Set<unknown>();
        // The feature draws its own rotation, so every quarter turn is reached over four seeds.
        for (let seed = 0; seed < 8; seed++) {
            const built = region(source());
            fillStone(built);
            fossil(
                ['minecraft:fossil/spine_1'],
                ['minecraft:fossil/spine_1'],
                'minecraft:empty',
                'minecraft:empty',
                4
            ).place(built.featureWorld(), new WorldgenRandom(BigInt(seed)), { x: 8, y: 63, z: 8 });

            for (const block of templateBlocks(built)) {
                if (block.name === 'minecraft:bone_block') axes.add(block.states['pillar_axis']);
            }
        }

        expect([...axes].sort()).toEqual(['x', 'z']);
    });

    it('runs the processor list the feature named', () => {
        const built = region(
            source({
                'minecraft:fossil_diamonds': {
                    processors: [
                        {
                            processor_type: 'minecraft:rule',
                            rules: [
                                {
                                    input_predicate: {
                                        predicate_type: 'minecraft:block_match',
                                        block: 'minecraft:coal_ore'
                                    },
                                    location_predicate: { predicate_type: 'minecraft:always_true' },
                                    output_state: 'minecraft:deepslate_diamond_ore'
                                }
                            ]
                        }
                    ]
                }
            })
        );
        fillStone(built);

        expect(placeFossil(built, 'minecraft:empty', 'minecraft:fossil_diamonds')).toBe(true);

        const names = new Set(templateBlocks(built).map((block) => block.name));
        expect(names.has('minecraft:deepslate_diamond_ore')).toBe(true);
        expect(names.has('minecraft:coal_ore')).toBe(false);
    });

    it('places nothing on a server that carries no templates', () => {
        const built = region();
        fillStone(built);

        expect(placeFossil(built)).toBe(false);
        expect(templateBlocks(built)).toHaveLength(0);
    });

    it('places nothing for a template identifier the source does not know', () => {
        const built = region(source());
        fillStone(built);

        const placed = fossil(
            ['minecraft:fossil/skull_9'],
            ['minecraft:fossil/skull_9'],
            'minecraft:empty',
            'minecraft:empty',
            4
        ).place(built.featureWorld(), new WorldgenRandom(SEED), { x: 8, y: 63, z: 8 });

        expect(placed).toBe(false);
        expect(templateBlocks(built)).toHaveLength(0);
    });

    /** Stamps the suspicious sand at a position in the center chunk, as the desert well does. */
    const stampSand = (built: GenerationRegion, x: number, processors?: TemplateProcessors): boolean =>
        built.featureWorld().placeTemplate!({
            template: 'minecraft:desert_well/suspicious_sand',
            origin: { x, y: 62, z: 8 },
            rotation: 0,
            mirror: 'none',
            ...(processors === undefined ? {} : { processors })
        });

    it('records the block entity a template block saved', () => {
        const built = region(source());
        fillStone(built);

        expect(stampSand(built, 8)).toBe(true);

        const entities = built.centerBlockEntities();
        expect(entities).toHaveLength(1);
        expect(entities[0]!.request.id).toBe('minecraft:brushable_block');
    });

    it('appends the loot table of a processor list written inline', () => {
        const built = region(source());
        fillStone(built);

        expect(stampSand(built, 8, ARCHAEOLOGY)).toBe(true);

        // Java writes the desert well's archaeology rule where the feature stands rather than
        // naming a list. A placement that drops it leaves sand with nothing to brush out.
        expect(built.centerBlockEntities()[0]!.request.lootTable).toBe('minecraft:archaeology/desert_well');
    });

    it('keeps one placement of a template out of the next', () => {
        const built = region(source());
        fillStone(built);

        // `append_loot` adds the table to the compound it is handed, and the source keeps the
        // decoded template for the life of the world. The second sand has no rule over it, so a
        // table on it would be the first placement's, baked into the template they share.
        expect(stampSand(built, 8, ARCHAEOLOGY)).toBe(true);
        expect(stampSand(built, 10)).toBe(true);

        const tables = built.centerBlockEntities().map((entity) => entity.request.lootTable);
        expect(tables.sort()).toEqual(['minecraft:archaeology/desert_well', undefined]);
    });

    it('lets a later feature write over a template block', () => {
        const built = region(source());
        fillStone(built);
        placeFossil(built);

        const first = templateBlocks(built)[0]!;
        built.write(first.x, first.y, first.z, STONE);

        expect(built.blockAt(first.x, first.y, first.z).bedrock).toBeUndefined();
        expect(built.stateAt(first.x, first.y, first.z).name).toBe('minecraft:stone');
    });
});
