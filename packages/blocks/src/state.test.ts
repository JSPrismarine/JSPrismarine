import { describe, expect, it } from 'vitest';

import { BlockError } from './errors';
import { BlockPalette, BlockStateModel, vanillaBlockPalette } from './state';

const stairs = () =>
    new BlockStateModel([
        { name: 'weirdo_direction', type: 'int', values: [0, 1, 2, 3], defaultValue: 0 },
        { name: 'upside_down_bit', type: 'bool', values: [0, 1], defaultValue: 0 },
        { name: 'minecraft:corner', type: 'string', values: ['none', 'left', 'right'], defaultValue: 'none' }
    ]);

describe('a block state model', () => {
    it('orders states by name and counts every combination', () => {
        const model = stairs();

        expect(model.names()).toEqual(['minecraft:corner', 'upside_down_bit', 'weirdo_direction']);
        expect(model.size).toBe(3 * 2 * 4);
    });

    it('reads a bit as a boolean however the capture wrote it', () => {
        const model = stairs();

        expect(model.state('upside_down_bit')?.values).toEqual([false, true]);
        expect(model.encode({ upside_down_bit: 1 })).toBe(model.encode({ upside_down_bit: true }));
    });

    it('round trips every index', () => {
        const model = stairs();

        for (let index = 0; index < model.size; index += 1) {
            expect(model.encode(model.decode(index))).toBe(index);
        }
    });

    it('counts the last state fastest, so index 1 moves only the last state', () => {
        const model = stairs();

        expect(model.decode(0)).toEqual({
            'minecraft:corner': 'none',
            upside_down_bit: false,
            weirdo_direction: 0
        });
        expect(model.decode(1)).toEqual({
            'minecraft:corner': 'none',
            upside_down_bit: false,
            weirdo_direction: 1
        });
        expect(model.decode(4)).toEqual({
            'minecraft:corner': 'none',
            upside_down_bit: true,
            weirdo_direction: 0
        });
    });

    it('fills a state the caller left out with its default', () => {
        const model = stairs();

        expect(model.encode({})).toBe(model.defaultIndex);
        expect(model.encode({ weirdo_direction: 2 })).toBe(model.encode({ weirdo_direction: 2 }));
    });

    it('rejects a name the block does not carry and a value outside the domain', () => {
        const model = stairs();

        expect(() => model.encode({ nonsense: 1 })).toThrow(BlockError);
        expect(() => model.encode({ weirdo_direction: 9 })).toThrow(BlockError);
        expect(() => model.decode(model.size)).toThrow(BlockError);
    });

    it('gives a stateless block exactly one combination', () => {
        const model = new BlockStateModel([]);

        expect(model.size).toBe(1);
        expect(model.encode({})).toBe(0);
        expect(model.decode(0)).toEqual({});
    });
});

describe('a block palette', () => {
    it('assigns dense ids in identifier order', () => {
        const palette = new BlockPalette([
            ['minecraft:stone', new BlockStateModel([])],
            ['minecraft:acacia_stairs', stairs()]
        ]);

        expect(palette.entries.map((entry) => entry.identifier)).toEqual([
            'minecraft:acacia_stairs',
            'minecraft:stone'
        ]);
        expect(palette.stateCount).toBe(25);
        expect(palette.runtimeId('minecraft:stone')).toBe(24);
    });

    it('round trips every runtime id back to its block and state', () => {
        const palette = new BlockPalette([
            ['minecraft:stone', new BlockStateModel([])],
            ['minecraft:acacia_stairs', stairs()]
        ]);

        for (let id = 0; id < palette.stateCount; id += 1) {
            const { entry, values } = palette.stateOf(id);
            expect(palette.runtimeId(entry.identifier, values)).toBe(id);
        }
    });

    it('rejects an unknown identifier and an id outside the palette', () => {
        const palette = new BlockPalette([['minecraft:stone', new BlockStateModel([])]]);

        expect(() => palette.runtimeId('minecraft:nope')).toThrow(BlockError);
        expect(() => palette.stateOf(1)).toThrow(BlockError);
    });
});

describe('the captured vanilla palette', () => {
    it('holds the 1477 blocks and 22079 states the capture reports', () => {
        const palette = vanillaBlockPalette();

        expect(palette.entries.length).toBe(1477);
        expect(palette.stateCount).toBe(22079);
    });

    it('keeps cocoa to the three ages the game accepts, not the global sixteen', () => {
        const cocoa = vanillaBlockPalette().entry('minecraft:cocoa');

        expect(cocoa?.model.state('age')?.values).toEqual([0, 1, 2]);
        expect(cocoa?.model.size).toBe(12);
    });

    it('round trips every state of every block', () => {
        const palette = vanillaBlockPalette();

        for (let id = 0; id < palette.stateCount; id += 1) {
            const { entry, values } = palette.stateOf(id);
            expect(palette.runtimeId(entry.identifier, values)).toBe(id);
        }
    });
});
