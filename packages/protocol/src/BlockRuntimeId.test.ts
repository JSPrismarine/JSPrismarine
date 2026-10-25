import { describe, expect, it } from 'vitest';

import {
    UNKNOWN_BLOCK_NAME,
    UNKNOWN_RUNTIME_ID,
    blockRuntimeId,
    blockStateCompound,
    fnv1a32,
    writeBlockStateNbt
} from './BlockRuntimeId';

import type { BlockStateValue } from './BlockRuntimeId';

describe('block runtime ids', () => {
    describe('fnv1a32', () => {
        // The algorithm's own published vectors, so the hash is pinned against something other
        // than the block ids it is used for.
        // http://www.isthe.com/chongo/tech/comp/fnv/
        const vectors: Array<[string, number]> = [
            ['', 0x811c9dc5 | 0],
            ['a', 0xe40c292c | 0],
            ['foobar', 0xbf9cf968 | 0]
        ];

        it.each(vectors)('matches the published vector for %o', (input, expected) => {
            expect(fnv1a32(Buffer.from(input, 'utf8'))).toBe(expected);
        });
    });

    describe('the compound the hash is taken over', () => {
        it('writes the exact little endian bytes a stateless block hashes to', () => {
            expect([...writeBlockStateNbt(blockStateCompound('minecraft:air'))]).toEqual([
                0x0a,
                0x00,
                0x00, // TAG_Compound, root name length 0 (u16 LE)
                0x08,
                0x04,
                0x00,
                ...Buffer.from('name'), // TAG_String "name"
                0x0d,
                0x00,
                ...Buffer.from('minecraft:air'), // its value
                0x0a,
                0x06,
                0x00,
                ...Buffer.from('states'), // TAG_Compound "states"
                0x00, // TAG_End of states
                0x00 // TAG_End of root
            ]);
        });

        it('writes a flag as a byte and a number as an int, which hash differently', () => {
            const flag = writeBlockStateNbt(blockStateCompound('minecraft:b', { v: true }));
            const number = writeBlockStateNbt(blockStateCompound('minecraft:b', { v: 1 }));

            expect(flag.includes(Buffer.from([0x01, 0x01, 0x00, 0x76, 0x01]))).toBe(true);
            expect(number.includes(Buffer.from([0x03, 0x01, 0x00, 0x76, 0x01, 0x00, 0x00, 0x00]))).toBe(true);
            expect(blockRuntimeId('minecraft:b', { v: true })).not.toBe(blockRuntimeId('minecraft:b', { v: 1 }));
        });

        it('sorts the properties, so the order they were given in cannot change the id', () => {
            const forwards: Record<string, BlockStateValue> = { button_pressed_bit: false, facing_direction: 3 };
            const backwards: Record<string, BlockStateValue> = { facing_direction: 3, button_pressed_bit: false };

            expect(blockRuntimeId('minecraft:stone_button', forwards)).toBe(
                blockRuntimeId('minecraft:stone_button', backwards)
            );
        });
    });

    describe('against a real server', () => {
        // Read off the `block_states` compounds a Bedrock Dedicated Server 1.26.51.1 put in its
        // creative catalog, which carry the server's own `network_id` beside the state. One per
        // value type, since the type is what the hash turns on.
        const captured: Array<[string, Readonly<Record<string, BlockStateValue>>, number]> = [
            ['minecraft:stone', {}, -2144268767],
            ['minecraft:brown_mushroom_block', { huge_mushroom_bits: 14 }, 203547508],
            ['minecraft:pointed_dripstone', { dripstone_thickness: 'tip', hanging: true }, 1659726445],
            [
                'minecraft:cobblestone_wall',
                {
                    wall_connection_type_east: 'none',
                    wall_connection_type_north: 'none',
                    wall_connection_type_south: 'none',
                    wall_connection_type_west: 'none',
                    wall_post_bit: false
                },
                -261790837
            ],
            [
                'minecraft:normal_stone_stairs',
                { 'minecraft:corner': 'none', upside_down_bit: false, weirdo_direction: 0 },
                1084683854
            ]
        ];

        it.each(captured)('computes the id the server gave %s', (name, states, networkId) => {
            expect(blockRuntimeId(name, states)).toBe(networkId);
        });
    });

    it('does not hash the unknown block, which has a reserved id', () => {
        expect(blockRuntimeId(UNKNOWN_BLOCK_NAME)).toBe(UNKNOWN_RUNTIME_ID);
    });
});
