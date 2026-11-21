import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import { craftingDataPacket } from '../wire/definitions/craftingData';
import { layoutAt } from '../../wire/WireLayout';
import CraftingDataPacket, { RecipeUnlockingContext, recipeUuidFor } from './CraftingDataPacket';

import type { CraftingData } from './CraftingDataPacket';
import { capture } from '../../testing/evidence.test.helper';

/** A file of the repository, by its path from the root. */
/** LEB128, which is what the docs call a varuint. */
const varuint = (value: number): number[] => {
    const bytes: number[] = [];
    let rest = value >>> 0;

    do {
        const byte = rest & 0x7f;
        rest >>>= 7;
        bytes.push(rest > 0 ? byte | 0x80 : byte);
    } while (rest > 0);

    return bytes;
};

/** ZigZag then LEB128, which is what the docs call a varint32. */
const varint = (value: number): number[] => varuint((value << 1) ^ (value >> 31));

const str = (text: string): number[] => {
    const utf8 = Buffer.from(text, 'utf-8');
    return [...varuint(utf8.byteLength), ...utf8];
};

/** An `mce::UUID`: the two halves of the digest, each as a little endian uint64. */
const uuidBytes = (id: string): number[] => {
    const digest = crypto.createHash('md5').update(id).digest();

    return [...Buffer.from(digest.subarray(0, 8)).reverse(), ...Buffer.from(digest.subarray(8, 16)).reverse()];
};

/** One `ItemStack`. */
const stack = (id: number, count: number, meta = 0): number[] => [
    ...varint(id),
    count & 0xff,
    count >> 8,
    ...varuint(meta),
    ...varint(0),
    ...varuint(0)
];

/** A `name` descriptor: the DEFAULT variant, the word `name`, the item's name, its aux, the count. */
const named = (name: string, meta: number, count: number): number[] => [
    ...varuint(1),
    ...str('name'),
    ...str(name),
    ...varint(meta),
    ...varint(count)
];

/** The empty slot of a shaped pattern: the INVALID variant, the wildcard meta, a zero count. */
const EMPTY_SLOT = [...varuint(0), ...varint(32767), ...varint(0)];

/** The optional unlocking requirement: present, ALWAYS_UNLOCKED, no ingredient list. */
const UNLOCKED = [0x01, ...varint(1), 0x00];

/** The four empty lists between Shapeless Recipes and Smithing Transform Recipes, each a zero count. */
const SKIPPED_FOUR = [0x00, 0x00, 0x00, 0x00];

const empty: CraftingData = {
    shaped: [],
    shapeless: [],
    multi: [],
    userDataShapeless: [],
    shapelessChemistry: [],
    shapedChemistry: [],
    smithingTransform: [],
    smithingTrim: [],
    potionMixes: [],
    containerMixes: [],
    materialReducers: [],
    cleanRecipes: true
};

const encode = (data: CraftingData): number[] => [...new CraftingDataPacket(data).serialize(new NetworkBinaryStream())];

const decode = (bytes: number[]): CraftingData =>
    new CraftingDataPacket().deserialize(new NetworkBinaryStream(Buffer.from(bytes)));

/** Packet id 0x34 as a varuint. */
const HEADER = varuint(0x34);

describe('CraftingDataPacket', () => {
    it('writes eleven arrays and the flag', () => {
        expect(encode(empty)).toEqual([...HEADER, 0x00, 0x00, ...SKIPPED_FOUR, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
    });

    it('writes a shaped recipe with every slot of the pattern, holes included', () => {
        const data = encode({
            ...empty,
            shaped: [
                {
                    id: 'minecraft:stick',
                    netId: 9,
                    station: 'crafting_table',
                    width: 1,
                    height: 2,
                    pattern: [
                        { descriptor: { kind: 'name', name: 'minecraft:oak_planks', meta: 0 }, count: 1 },
                        { descriptor: null, count: 0 }
                    ],
                    outputs: [{ runtimeId: 7, count: 4, meta: 0, blockRuntimeId: 0 }],
                    priority: 0,
                    symmetric: false
                }
            ]
        });

        expect(data).toEqual([
            ...HEADER,
            0x01, // One shaped recipe.
            ...str('minecraft:stick'),
            ...varint(1), // Width.
            ...varint(2), // Height.
            ...varuint(2), // The pattern is a counted list of width * height slots.
            ...named('minecraft:oak_planks', 0, 1),
            ...EMPTY_SLOT,
            ...varuint(1), // One output.
            ...stack(7, 4),
            ...uuidBytes('minecraft:stick'),
            ...str('crafting_table'),
            ...varint(0), // Priority.
            0x00, // Symmetric.
            ...UNLOCKED,
            ...varuint(9), // Net id.
            0x00, // Shapeless.
            ...SKIPPED_FOUR,
            0x00, // Smithing transform.
            0x00, // Smithing trim.
            0x00, // Potion mixes.
            0x00, // Container mixes.
            0x00, // Material reducers.
            0x01 // Clear recipes.
        ]);
    });

    it('writes a shapeless recipe, which carries no grid and no symmetry flag', () => {
        const data = encode({
            ...empty,
            shapeless: [
                {
                    id: 'minecraft:oak_planks',
                    netId: 3,
                    station: 'stonecutter',
                    ingredients: [{ descriptor: { kind: 'tag', tag: 'minecraft:logs' }, count: 1 }],
                    outputs: [{ runtimeId: 7, count: 4, meta: 0, blockRuntimeId: 0 }],
                    priority: 2
                }
            ]
        });

        expect(data).toEqual([
            ...HEADER,
            0x00,
            0x01,
            ...str('minecraft:oak_planks'),
            ...varuint(1),
            // A tag slot: the DEFAULT variant, `item_tag`, the tag, the wildcard meta, the count.
            ...varuint(1),
            ...str('item_tag'),
            ...str('minecraft:logs'),
            ...varint(32767),
            ...varint(1),
            ...varuint(1),
            ...stack(7, 4),
            ...uuidBytes('minecraft:oak_planks'),
            ...str('stonecutter'),
            ...varint(2),
            ...UNLOCKED,
            ...varuint(3),
            ...SKIPPED_FOUR,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x01
        ]);
    });

    it('writes a potion mix as six numbers, which is the one entry that names nothing', () => {
        const data = encode({
            ...empty,
            potionMixes: [{ inputId: 373, inputMeta: 0, reagentId: 372, reagentMeta: 0, outputId: 373, outputMeta: 5 }],
            cleanRecipes: false
        });

        expect(data).toEqual([
            ...HEADER,
            0x00,
            0x00,
            ...SKIPPED_FOUR,
            0x00, // Smithing transform.
            0x00, // Smithing trim.
            0x01, // One potion mix.
            ...varint(373),
            ...varint(0),
            ...varint(372),
            ...varint(0),
            ...varint(373),
            ...varint(5),
            0x00,
            0x00,
            0x00 // Clear recipes.
        ]);
    });

    it('derives a recipe UUID from its id, so a book does not reset between starts', () => {
        expect(recipeUuidFor('minecraft:stick')).toEqual(recipeUuidFor('minecraft:stick'));
        expect(recipeUuidFor('minecraft:stick')).not.toEqual(recipeUuidFor('minecraft:torch'));
        expect(recipeUuidFor('minecraft:stick').byteLength).toBe(16);
    });

    it('reads back every list it writes', () => {
        const unlocked = { context: RecipeUnlockingContext.ALWAYS_UNLOCKED, ingredients: null };
        const stick = { runtimeId: 7, count: 4, meta: 0, blockRuntimeId: 0, userData: Buffer.alloc(0) };
        const data: CraftingData = {
            shaped: [
                {
                    id: 'minecraft:stick',
                    netId: 9,
                    station: 'crafting_table',
                    width: 1,
                    height: 2,
                    pattern: [
                        { descriptor: { kind: 'name', name: 'minecraft:oak_planks', meta: 0 }, count: 1 },
                        { descriptor: null, count: 0 }
                    ],
                    outputs: [stick],
                    uuid: recipeUuidFor('minecraft:stick'),
                    unlocking: unlocked,
                    priority: 0,
                    symmetric: false
                }
            ],
            shapeless: [
                {
                    id: 'minecraft:oak_planks',
                    netId: 3,
                    station: 'stonecutter',
                    ingredients: [
                        { descriptor: { kind: 'tag', tag: 'minecraft:logs' }, count: 1 },
                        { descriptor: { kind: 'molang', expression: 'q.is_log', version: 7 }, count: 2 }
                    ],
                    outputs: [stick],
                    uuid: recipeUuidFor('minecraft:oak_planks'),
                    unlocking: {
                        context: RecipeUnlockingContext.NONE,
                        ingredients: [{ descriptor: { kind: 'name', name: 'minecraft:log', meta: 0 }, count: 1 }]
                    },
                    priority: 2
                }
            ],
            multi: [{ uuid: recipeUuidFor('map_cloning'), netId: 4 }],
            userDataShapeless: [
                {
                    id: 'minecraft:banner',
                    netId: 5,
                    station: 'crafting_table',
                    ingredients: [],
                    outputs: [],
                    uuid: recipeUuidFor('minecraft:banner'),
                    unlocking: null,
                    priority: 0
                }
            ],
            shapelessChemistry: [],
            shapedChemistry: [],
            smithingTransform: [
                {
                    id: 'minecraft:netherite_sword',
                    netId: 11,
                    station: 'smithing_table',
                    template: { descriptor: { kind: 'name', name: 'minecraft:netherite_upgrade', meta: 0 }, count: 1 },
                    base: { descriptor: { kind: 'name', name: 'minecraft:diamond_sword', meta: 0 }, count: 1 },
                    addition: { descriptor: { kind: 'name', name: 'minecraft:netherite_ingot', meta: 0 }, count: 1 },
                    output: { runtimeId: 7, count: 1, meta: 0, blockRuntimeId: 0, userData: Buffer.alloc(0) }
                }
            ],
            smithingTrim: [
                {
                    id: 'minecraft:trim',
                    netId: 12,
                    station: 'smithing_table',
                    template: { descriptor: { kind: 'name', name: 'minecraft:trim_template', meta: 0 }, count: 1 },
                    base: { descriptor: { kind: 'tag', tag: 'minecraft:trimmable_armors' }, count: 1 },
                    addition: { descriptor: { kind: 'tag', tag: 'minecraft:trim_materials' }, count: 1 }
                }
            ],
            potionMixes: [{ inputId: 373, inputMeta: 0, reagentId: 372, reagentMeta: 0, outputId: 373, outputMeta: 5 }],
            containerMixes: [{ fromItemId: 373, reagentItemId: 289, toItemId: 438 }],
            materialReducers: [
                {
                    fromItemKey: 1234,
                    outputs: [
                        { itemId: 5, itemCount: 2 },
                        { itemId: 6, itemCount: 1 }
                    ]
                }
            ],
            cleanRecipes: true
        };

        expect(decode(encode(data))).toEqual(data);
    });

    it('writes a multi recipe as its UUID and net id, and a container mix as three ids', () => {
        const uuid = recipeUuidFor('map_cloning');
        const data = encode({
            ...empty,
            multi: [{ uuid, netId: 4 }],
            containerMixes: [{ fromItemId: 373, reagentItemId: 289, toItemId: 438 }]
        });

        expect(data).toEqual([
            ...HEADER,
            0x00,
            0x00,
            0x01, // One multi recipe.
            ...Buffer.from(uuid.subarray(0, 8)).reverse(),
            ...Buffer.from(uuid.subarray(8, 16)).reverse(),
            ...varuint(4),
            0x00,
            0x00,
            0x00,
            0x00, // Smithing transform.
            0x00, // Smithing trim.
            0x00, // Potion mixes.
            0x01, // One container mix.
            ...varint(373),
            ...varint(289),
            ...varint(438),
            0x00, // Material reducers.
            0x01
        ]);
    });

    it('writes the unlocking requirement as an absent optional when it is null', () => {
        const data = encode({
            ...empty,
            shapeless: [
                {
                    id: 'a',
                    netId: 1,
                    station: 'crafting_table',
                    ingredients: [],
                    outputs: [],
                    priority: 0,
                    unlocking: null
                }
            ]
        });

        // The priority, the optional's presence byte (absent), then the net id, ahead of ten more bytes.
        const tail = [...varint(0), 0x00, ...varuint(1)];
        expect(data.slice(data.length - 10 - tail.length, data.length - 10)).toEqual(tail);
        expect(decode(data).shapeless[0]?.unlocking).toBeNull();
    });

    // The 1.26.50 and 1.26.60 pages print an ingredient as a `Descriptor Type` uint8 followed by
    // a `StackSize` uint16, and give `MolangVersion` different numbers (0 versus -1 for
    // `Invalid`). The captured packet from a real server at each protocol carries the legacy
    // form `{ variant, name, descriptor, count }` this layout writes, with every recipe list
    // filled, and no ingredient is a Molang one, so the version numbering is never exercised.
    describe.each([2193, 2225])('the captured recipe list at protocol %i', (protocol) => {
        const bytes = capture(protocol, 0x34);
        const layout = layoutAt(craftingDataPacket, protocol);

        it('re-encodes to the bytes the real server sent', () => {
            const stream = new NetworkBinaryStream(bytes);
            const payload = layout.decode(stream);

            expect(stream.feof()).toBe(true);
            const encoded = new NetworkBinaryStream();
            layout.encode(encoded, payload);
            expect(encoded.getBuffer().equals(bytes)).toBe(true);
        });

        it('fills the lists the packet has a payload type for', () => {
            const payload = layout.decode(new NetworkBinaryStream(bytes));

            expect(payload.shaped[0]).toMatchObject({
                id: 'minecraft:barrel',
                width: 3,
                height: 3,
                station: 'deprecated'
            });
            expect(payload.shaped[0]?.pattern[0]?.descriptor).toEqual({
                kind: 'name',
                name: 'minecraft:stick',
                meta: 32767
            });
            expect(payload.shaped[0]?.pattern[1]?.descriptor).toEqual({
                kind: 'tag',
                tag: 'minecraft:wooden_slabs'
            });
            for (const list of [
                payload.multi,
                payload.userDataShapeless,
                payload.smithingTransform,
                payload.smithingTrim,
                payload.potionMixes,
                payload.containerMixes
            ]) {
                expect(list.length).toBeGreaterThan(0);
            }
            expect(payload.cleanRecipes).toBe(true);
        });
    });
});
