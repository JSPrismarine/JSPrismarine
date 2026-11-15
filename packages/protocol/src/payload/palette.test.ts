import { block_definitions, creative_groups, creativeitems } from '@jsprismarine/bedrock-data';
import { vanillaBlockPalette } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import {
    BlockPaletteError,
    UNKNOWN_BLOCK_NAME,
    UNKNOWN_RUNTIME_ID,
    assertBlockPaletteAgrees,
    blockRuntimeId,
    blockStateCompound,
    fnv1a32,
    readCapturedBlockState,
    writeBlockStateNbt
} from './palette';
import { nbtCompound, nbtInt, nbtList, nbtString, writeNetworkNbt } from './nbt';

import type { BlockProperty } from '../packet/StartGamePacket';

/**
 * Every block runtime id a real server put in the creative catalog, with the item that carries
 * it. The catalog is the `CreativeContentPacket` a Bedrock Dedicated Server sent, which names a
 * block by its hashed runtime id and nothing else.
 */
const captured = (): readonly { readonly item: string; readonly networkId: number }[] => [
    ...creative_groups.flatMap((group) =>
        group.icon_block_states === undefined
            ? []
            : [{ item: group.icon, networkId: readCapturedBlockState(group.icon_block_states).networkId }]
    ),
    ...creativeitems.flatMap((entry) =>
        entry.block_states === undefined
            ? []
            : [{ item: entry.name, networkId: readCapturedBlockState(entry.block_states).networkId }]
    )
];

/** The runtime id this server computes for every state of the captured palette, to its block. */
const paletteHashes = (): ReadonlyMap<number, string> => {
    const palette = vanillaBlockPalette();
    const hashes = new Map<number, string>();
    for (let runtimeId = 0; runtimeId < palette.stateCount; runtimeId++) {
        const { entry, values } = palette.stateOf(runtimeId);
        hashes.set(blockRuntimeId(entry.identifier, values), entry.identifier);
    }
    return hashes;
};

describe('fnv1a32', () => {
    it('matches the published test vectors for the algorithm', () => {
        expect(fnv1a32(Buffer.from('')) >>> 0).toBe(0x811c9dc5);
        expect(fnv1a32(Buffer.from('a')) >>> 0).toBe(0xe40c292c);
        expect(fnv1a32(Buffer.from('foobar')) >>> 0).toBe(0xbf9cf968);
    });
});

describe('writeBlockStateNbt', () => {
    it('writes the compound with fixed width lengths, not the network varints', () => {
        const bytes = writeBlockStateNbt(blockStateCompound('minecraft:stone'));

        // TAG_Compound, an empty name as a two byte length, then TAG_String
        // `name` - the varint flavor would write one byte lengths here.
        expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x0a, 0x00, 0x00, 0x08]));
    });

    it('sorts the states, because the two sides hash bytes and not meaning', () => {
        expect(writeBlockStateNbt(blockStateCompound('a', { zebra: 1, apple: 2 }))).toEqual(
            writeBlockStateNbt(blockStateCompound('a', { apple: 2, zebra: 1 }))
        );
    });
});

describe('blockRuntimeId', () => {
    it('reserves minus two for the unknown block, whatever states it is asked about', () => {
        expect(blockRuntimeId(UNKNOWN_BLOCK_NAME)).toBe(UNKNOWN_RUNTIME_ID);
        expect(blockRuntimeId(UNKNOWN_BLOCK_NAME, { anything: 3 })).toBe(UNKNOWN_RUNTIME_ID);
    });

    it('gives two states of one block two different ids', () => {
        expect(blockRuntimeId('minecraft:cocoa', { age: 0 })).not.toBe(blockRuntimeId('minecraft:cocoa', { age: 1 }));
    });
});

describe('against the runtime ids a real server recorded', () => {
    it('computes each of them for a state of the block the entry names', () => {
        // The client computes the same hash over the same compound, so a captured id this server
        // does not produce for that block is a block it would draw as something else.
        const hashes = paletteHashes();
        const states = captured();
        const disagreements = states.filter(({ item, networkId }) => hashes.get(networkId) !== item);

        expect(states.length).toBeGreaterThan(1000);
        expect(disagreements.map(({ item, networkId }) => `${item} ${networkId}`)).toEqual([]);
    });
});

describe('assertBlockPaletteAgrees', () => {
    const palette = vanillaBlockPalette();

    const property = (name: string, properties?: Record<string, readonly (number | string)[]>): BlockProperty => ({
        name,
        definition: writeNetworkNbt(
            nbtCompound({
                components: nbtCompound({}),
                properties:
                    properties === undefined
                        ? undefined
                        : nbtList(
                              Object.entries(properties).map(([state, values]) =>
                                  nbtCompound({
                                      enum: nbtList(
                                          values.map((value) =>
                                              typeof value === 'number' ? nbtInt(value) : nbtString(value)
                                          )
                                      ),
                                      name: nbtString(state)
                                  })
                              )
                          )
            })
        )
    });

    it('accepts the ninety-eight data driven vanilla blocks a real server sent', () => {
        expect(() =>
            assertBlockPaletteAgrees(
                block_definitions.map((entry) => ({ name: entry.name, definition: entry.definition })),
                palette
            )
        ).not.toThrow();
    });

    it('accepts a block that declares the states the palette has', () => {
        expect(() =>
            assertBlockPaletteAgrees([property('minecraft:cocoa', { age: [0, 1, 2] })], palette)
        ).not.toThrow();
    });

    it('refuses a vanilla name the palette does not have', () => {
        expect(() => assertBlockPaletteAgrees([property('minecraft:not_a_block')], palette)).toThrow(BlockPaletteError);
    });

    it('lets a pack declare a block of its own', () => {
        expect(() => assertBlockPaletteAgrees([property('test:thing')], palette)).not.toThrow();
    });

    it('refuses a state the palette does not have', () => {
        expect(() => assertBlockPaletteAgrees([property('minecraft:cocoa', { ripeness: [0, 1] })], palette)).toThrow(
            /ripeness/
        );
    });

    it('refuses a state whose values are not the palette’s', () => {
        expect(() => assertBlockPaletteAgrees([property('minecraft:cocoa', { age: [0, 1] })], palette)).toThrow(
            BlockPaletteError
        );
    });

    it('names every disagreement rather than the first', () => {
        try {
            assertBlockPaletteAgrees(
                [property('minecraft:not_a_block'), property('minecraft:also_not_a_block')],
                palette
            );
            expect.unreachable('the check should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(BlockPaletteError);
            if (error instanceof BlockPaletteError) expect(error.disagreements).toHaveLength(2);
        }
    });
});
