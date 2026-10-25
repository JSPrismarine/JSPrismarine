/**
 * What a template piece carries into a chunk besides its blocks.
 *
 * The templates are hand-built, so each case says what one saved block entity or one saved
 * entity is supposed to become rather than asserting against whatever Mojang shipped. The real
 * files are covered by `javaStructures.test.ts`, which runs against the server jar.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import type { BlockEntityRequest } from '@jsprismarine/features';
import { ByteOrder, NBTTagCompound, Types } from '@jsprismarine/nbt';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { createStructureTemplateStore, TemplatePiece } from './javaStructureTemplatePiece';
import { createTemplateSource } from './javaStructureTemplates';
import type { StructureLevel, StructureWriter } from './javaStructureWorld';

type Tag = NBTTagCompound | Set<unknown> | Types.StringVal | Types.NumberVal | Types.FloatVal;

const int = (value: number) => new Types.NumberVal(value);
const str = (value: string) => new Types.StringVal(value);
const float = (value: number) => new Types.FloatVal(value);
const triple = (x: number, y: number, z: number) => new Set([int(x), int(y), int(z)]);
const doubles = (x: number, y: number, z: number) => new Set([float(x), float(y), float(z)]);

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
 * A three by one by three room holding a chest, a vault and a villager.
 *
 * The chest carries its table at the top level the way every container does; the vault carries
 * its own a level down inside `config`, which is the shape a trial chamber's reward uses.
 */
const roomTemplate = () =>
    encode(
        compound({
            DataVersion: int(5023),
            size: triple(3, 1, 3),
            palette: new Set([
                compound({ id: str('minecraft:stone') }),
                compound({ id: str('minecraft:chest'), properties: compound({ facing: str('north') }) }),
                compound({ id: str('minecraft:vault'), properties: compound({ facing: str('north') }) })
            ]),
            blocks: new Set([
                compound({ pos: triple(0, 0, 0), state: int(0) }),
                compound({
                    pos: triple(1, 0, 0),
                    state: int(1),
                    nbt: compound({
                        id: str('minecraft:chest'),
                        LootTable: str('minecraft:chests/village/village_plains_house')
                    })
                }),
                compound({
                    pos: triple(2, 0, 0),
                    state: int(2),
                    nbt: compound({
                        id: str('minecraft:vault'),
                        config: compound({ loot_table: str('minecraft:chests/trial_chambers/reward') })
                    })
                })
            ]),
            entities: new Set([
                compound({
                    pos: doubles(2.5, 0, 2.5),
                    blockPos: triple(2, 0, 2),
                    nbt: compound({ id: str('minecraft:villager'), Rotation: new Set([float(90), float(0)]) })
                })
            ])
        })
    );

const TEMPLATE = 'test:room';

const store = () =>
    createStructureTemplateStore(createTemplateSource(() => new Map([[TEMPLATE, roomTemplate()]]), new Map()));

const level: StructureLevel = {
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: () => 64,
    baseBlock: () => ({ name: 'minecraft:stone', properties: {} }),
    noiseBiome: () => 'minecraft:plains'
};

interface Recorded {
    readonly blockEntities: { x: number; y: number; z: number; request: BlockEntityRequest }[];
    readonly spawns: { type: string; x: number; y: number; z: number; yaw: number }[];
}

const place = (placement: Parameters<ReturnType<typeof store>['prepared']>[1]): Recorded => {
    const recorded: Recorded = { blockEntities: [], spawns: [] };
    const writer: StructureWriter = {
        level,
        blockAt: () => ({ name: 'minecraft:air', properties: {} }),
        setBlock: () => true,
        setBedrockBlock: () => true,
        setBlockEntity: (x, y, z, request) => recorded.blockEntities.push({ x, y, z, request }),
        spawnEntity: (type, x, y, z, yaw) => recorded.spawns.push({ type, x, y, z, yaw }),
        heightAt: () => 64,
        hasTag: () => false
    };

    new TemplatePiece({ store: store(), template: TEMPLATE, position: [10, 64, 20], placement }).place(
        writer,
        createLegacyRandom(1n)
    );
    return recorded;
};

describe('a template piece', () => {
    it('attaches the block entity a template block carries', () => {
        const { blockEntities } = place({});

        expect(blockEntities.map((entry) => entry.request.id)).toEqual(['minecraft:chest', 'minecraft:vault']);
        expect(blockEntities[0]).toMatchObject({ x: 11, y: 64, z: 20 });
    });

    it('reads a container loot table from the top level, and leaves a vault its own', () => {
        const tables = place({}).blockEntities.map((entry) => entry.request.lootTable);

        // The vault's table stays in the `config` the saved compound carries, which is where
        // Bedrock reads it. A top-level one beside it would be a tag nothing reads.
        expect(tables).toEqual(['minecraft:chests/village/village_plains_house', undefined]);
    });

    it('hands the whole saved compound on, so the chunk can translate the rest of it', () => {
        const [chest, vault] = place({}).blockEntities;
        const savedVault = vault?.request.saved;

        expect(chest?.request.saved).toBeInstanceOf(NBTTagCompound);
        // The vault's `config`, which the three fields read out here never carried.
        expect(savedVault instanceof NBTTagCompound && savedVault.getCompound('config', false)).toBeTruthy();
    });

    it('names the Java block a saved compound sat in, through a rotation', () => {
        // Bedrock has one banner block where Java has sixteen, so the Java block is the only
        // place a banner's color survives. The lookup is by the compound's own identity, which
        // makes this a guard on the compound reaching the request unrebuilt.
        const blocks = place({ rotation: 'clockwise_90' }).blockEntities.map((entry) => entry.request.javaBlock);

        expect(blocks).toEqual(['minecraft:chest', 'minecraft:vault']);
    });

    it('records the entities the template saved, at the fractional position they stand on', () => {
        const { spawns } = place({});

        expect(spawns).toEqual([{ type: 'minecraft:villager', x: 12.5, y: 64, z: 22.5, yaw: 90 }]);
    });

    it('turns a saved entity with the template', () => {
        // A quarter turn moves the villager to the opposite corner and adds 90 to its facing.
        expect(place({ rotation: 'clockwise_90' }).spawns).toEqual([
            { type: 'minecraft:villager', x: 10.5, y: 64, z: 22.5, yaw: 180 }
        ]);
    });

    it('reflects a saved entity when the template is mirrored', () => {
        // Java reflects the angle about the axis the mirror works on: 180 less the yaw across
        // x, and the negated yaw across z.
        expect(place({ mirror: 'front_back' }).spawns).toEqual([
            { type: 'minecraft:villager', x: 10.5, y: 64, z: 22.5, yaw: 90 }
        ]);
        expect(place({ mirror: 'left_right' }).spawns).toEqual([
            { type: 'minecraft:villager', x: 12.5, y: 64, z: 20.5, yaw: -90 }
        ]);
    });
});

/** One gravel block, which is what a trail ruins rule turns into a suspicious one. */
const gravelTemplate = () =>
    encode(
        compound({
            DataVersion: int(5023),
            size: triple(1, 1, 1),
            palette: new Set([compound({ id: str('minecraft:gravel') })]),
            blocks: new Set([compound({ pos: triple(0, 0, 0), state: int(0) })]),
            entities: new Set([])
        })
    );

const GRAVEL = 'test:gravel';

/** Java's trail ruins archaeology rule, which is the only shape `append_loot` is written in. */
const APPEND_LOOT = {
    processors: [
        {
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:gravel' },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:suspicious_gravel',
                    block_entity_modifier: {
                        type: 'minecraft:append_loot',
                        loot_table: 'minecraft:archaeology/trail_ruins_common'
                    }
                }
            ]
        }
    ]
};

describe('a block entity a processor made rather than the template', () => {
    const placeGravel = (): Recorded => {
        const recorded: Recorded = { blockEntities: [], spawns: [] };
        const writer: StructureWriter = {
            level,
            blockAt: () => ({ name: 'minecraft:air', properties: {} }),
            setBlock: () => true,
            setBedrockBlock: () => true,
            setBlockEntity: (x, y, z, request) => recorded.blockEntities.push({ x, y, z, request }),
            spawnEntity: (type, x, y, z, yaw) => recorded.spawns.push({ type, x, y, z, yaw }),
            heightAt: () => 64,
            hasTag: () => false
        };

        new TemplatePiece({
            store: createStructureTemplateStore(
                createTemplateSource(() => new Map([[GRAVEL, gravelTemplate()]]), new Map())
            ),
            template: GRAVEL,
            position: [10, 64, 20],
            placement: {},
            processors: APPEND_LOOT
        }).place(writer, createLegacyRandom(1n));
        return recorded;
    };

    it('takes the type from the block, because the compound names none', () => {
        // `append_loot` writes a compound holding a loot table and nothing else, because Java
        // adds it to a block entity the suspicious gravel block already has. Without the block
        // to read the type off, the whole compound is dropped and the gravel holds nothing.
        const [brushable] = placeGravel().blockEntities;

        expect(brushable?.request.id).toBe('minecraft:brushable_block');
        expect(brushable?.request.lootTable).toBe('minecraft:archaeology/trail_ruins_common');
        expect(brushable).toMatchObject({ x: 10, y: 64, z: 20 });
    });
});
