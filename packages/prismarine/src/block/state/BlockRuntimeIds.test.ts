import { describe, expect, it } from 'vitest';

import { BlockState } from './BlockState';
import { BlockRuntimeIds, UNKNOWN_RUNTIME_ID, fnv1a32 } from './BlockRuntimeIds';
import { BlockStateSchema, BlockStateSchemas } from './BlockStateSchema';

describe('block', () => {
    describe('BlockRuntimeIds', () => {
        // There is no public table of vanilla block hashes to check against, so the two
        // halves are pinned separately against their own references: FNV-1a against the
        // algorithm's published test vectors, and the NBT layout byte by byte.
        describe('fnv1a32', () => {
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

        describe('NBT serialisation', () => {
            it('writes the exact little endian bytes the hash is taken over', () => {
                const bytes = BlockRuntimeIds.serialize(new BlockState('minecraft:air'));

                // TAG_Compound, empty root name, then "name" as a string, then an empty
                // "states" compound, then the two TAG_Ends.
                expect([...bytes]).toEqual([
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

            it('keeps each property on its vanilla NBT type', () => {
                // facing_direction is an int and button_pressed_bit a byte; swapping them
                // would still produce a hash, just not one the client can resolve.
                const bytes = BlockRuntimeIds.serialize(
                    BlockStateSchemas.get('minecraft:stone_button')!.getDefaultState()
                );

                expect(bytes.includes(Buffer.from([0x01, 0x12, 0x00, ...Buffer.from('button_pressed_bit')]))).toBe(
                    true
                );
                expect(bytes.includes(Buffer.from([0x03, 0x10, 0x00, ...Buffer.from('facing_direction')]))).toBe(true);
            });

            it('orders properties alphabetically, whatever order they were given in', () => {
                const forwards = new BlockState('minecraft:stone_button', {
                    button_pressed_bit: 0,
                    facing_direction: 3
                });
                const backwards = new BlockState('minecraft:stone_button', {
                    facing_direction: 3,
                    button_pressed_bit: 0
                });

                expect(BlockRuntimeIds.serialize(forwards).equals(BlockRuntimeIds.serialize(backwards))).toBe(true);
                expect(BlockRuntimeIds.get(forwards)).toBe(BlockRuntimeIds.get(backwards));
            });
        });

        describe('runtime ids', () => {
            it('gives each state of a block its own id', () => {
                const schema = BlockStateSchemas.get('minecraft:oak_log')!;
                const ids = schema.getAllStates().map((state) => BlockRuntimeIds.get(state));

                expect(ids.length).toBe(3); // pillar_axis x, y, z
                expect(new Set(ids).size).toBe(3); // and none of them collide
            });

            it('is stable across calls', () => {
                const state = new BlockState('minecraft:oak_log', { pillar_axis: 'x' });
                expect(BlockRuntimeIds.get(state)).toBe(BlockRuntimeIds.get(state));

                BlockRuntimeIds.reset();
                expect(BlockRuntimeIds.get(state)).toBe(
                    BlockRuntimeIds.get(new BlockState(state.name, { ...state.properties }))
                );
            });

            it('reserves the vanilla id for unknown blocks', () => {
                expect(BlockRuntimeIds.get(new BlockState('minecraft:unknown'))).toBe(UNKNOWN_RUNTIME_ID);
            });

            it('refuses a block nobody declared, instead of inventing an id', () => {
                expect(() => BlockRuntimeIds.get(new BlockState('myplugin:never_registered'))).toThrow(
                    /No block state schema/
                );
            });

            it('answers null rather than throwing when asked about a name that is not a block', () => {
                // What items need. A stick places nothing, and that is an answer, not a
                // fault - `getByName` raising on it stopped whole packets from encoding.
                expect(BlockRuntimeIds.tryGetByName('minecraft:stick')).toBeNull();
                expect(BlockRuntimeIds.tryGetByName('minecraft:stone')).toBe(
                    BlockRuntimeIds.getByName('minecraft:stone')
                );
            });
        });

        describe('plugin blocks', () => {
            it('does not disturb any vanilla id', () => {
                const before = BlockStateSchemas.get('minecraft:oak_log')!
                    .getAllStates()
                    .map((state) => BlockRuntimeIds.get(state));

                BlockStateSchemas.register(
                    new BlockStateSchema('myplugin:cool_block', {
                        charge: { type: 'int', values: [0, 1, 2], default: 0 }
                    })
                );
                BlockRuntimeIds.reset(); // worst case: nothing memoised to hide a change

                const after = BlockStateSchemas.get('minecraft:oak_log')!
                    .getAllStates()
                    .map((state) => BlockRuntimeIds.get(state));

                expect(after).toEqual(before);
                BlockStateSchemas.reset();
            });

            it('gets ids of its own without any coordination', () => {
                BlockStateSchemas.register(
                    new BlockStateSchema('myplugin:cool_block', {
                        charge: { type: 'int', values: [0, 1, 2], default: 0 }
                    })
                );

                const ids = BlockStateSchemas.get('myplugin:cool_block')!
                    .getAllStates()
                    .map((state) => BlockRuntimeIds.get(state));

                expect(new Set(ids).size).toBe(3);
                BlockStateSchemas.reset();
                BlockRuntimeIds.reset();
            });
        });
    });
});
