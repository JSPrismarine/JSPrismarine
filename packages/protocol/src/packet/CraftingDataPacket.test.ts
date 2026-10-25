import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CraftingDataPacket, { recipeUuidFor } from './CraftingDataPacket';

import type { CraftingData } from './CraftingDataPacket';

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

/** The four lists this packet has no payload type for, each written as a zero count. */
const SKIPPED_FOUR = [0x00, 0x00, 0x00, 0x00];

const empty: CraftingData = {
    shaped: [],
    shapeless: [],
    smithingTransform: [],
    potionMixes: [],
    cleanRecipes: true
};

const encode = (data: CraftingData): number[] => [...new CraftingDataPacket(data).serialize(new NetworkBinaryStream())];

const decode = (bytes: number[]): CraftingData =>
    new CraftingDataPacket().deserialize(new NetworkBinaryStream(Buffer.from(bytes)));

/** Packet id 0x34 as a varuint. */
const HEADER = varuint(0x34);

describe('CraftingDataPacket', () => {
    it('writes eleven arrays and the flag, with the ones it has no type for empty', () => {
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
                    outputs: [{ runtimeId: 7, count: 4, meta: 0, blockRuntimeId: 0, userData: Buffer.alloc(0) }],
                    priority: 0,
                    symmetric: false
                }
            ],
            shapeless: [
                {
                    id: 'minecraft:oak_planks',
                    netId: 3,
                    station: 'stonecutter',
                    ingredients: [{ descriptor: { kind: 'tag', tag: 'minecraft:logs' }, count: 1 }],
                    outputs: [{ runtimeId: 7, count: 4, meta: 0, blockRuntimeId: 0, userData: Buffer.alloc(0) }],
                    priority: 2
                }
            ],
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
            potionMixes: [{ inputId: 373, inputMeta: 0, reagentId: 372, reagentMeta: 0, outputId: 373, outputMeta: 5 }],
            cleanRecipes: true
        };

        expect(decode(encode(data))).toEqual(data);
    });
});
