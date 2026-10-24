import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import UnlockedRecipesPacket, { UnlockedRecipesType } from './UnlockedRecipesPacket';

import type { UnlockedRecipes } from './UnlockedRecipesPacket';

const DATA: UnlockedRecipes = {
    type: UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES,
    recipes: ['minecraft:stick', 'minecraft:crafting_table']
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xc7, 0x01], // packet id header, 199 as a varuint32
    ...[0x01, 0x00, 0x00, 0x00], // Packet Type InitiallyUnlockedRecipes, little-endian uint32
    0x02, // Unlocked Recipes List count, a varuint32
    ...[0x0f, ...Buffer.from('minecraft:stick', 'utf8')], // first recipe name, 15 bytes
    ...[0x18, ...Buffer.from('minecraft:crafting_table', 'utf8')] // second recipe name, 24 bytes
]);

/** Locking every recipe: the header, the type, and a zero count. */
const REMOVE_ALL: UnlockedRecipes = { type: UnlockedRecipesType.REMOVE_ALL_UNLOCKED_RECIPES, recipes: [] };
const REMOVE_ALL_BYTES = Buffer.from([0xc7, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00]);

describe('UnlockedRecipesPacket', () => {
    it('writes the type as four little-endian bytes before an empty list', () => {
        const buffer = new UnlockedRecipesPacket(REMOVE_ALL).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...REMOVE_ALL_BYTES]);
    });

    it('reads an empty list to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(REMOVE_ALL_BYTES);
        const data = new UnlockedRecipesPacket().deserialize(stream);

        expect(data).toEqual(REMOVE_ALL);
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new UnlockedRecipesPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new UnlockedRecipesPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('keeps the enum numbers the docs give', () => {
        expect(UnlockedRecipesType.EMPTY).toBe(0);
        expect(UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES).toBe(1);
        expect(UnlockedRecipesType.NEWLY_UNLOCKED_RECIPES).toBe(2);
        expect(UnlockedRecipesType.REMOVE_UNLOCKED_RECIPES).toBe(3);
        expect(UnlockedRecipesType.REMOVE_ALL_UNLOCKED_RECIPES).toBe(4);
    });
});
