import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { ContentPaletteError, assertContentPaletteAgrees } from './contentPalette';

import type { BlockStateDefinition } from '@jsprismarine/blocks';

const lit = (values: readonly boolean[]): BlockStateDefinition => ({
    name: 'lit',
    type: 'bool',
    values: [...values],
    defaultValue: values[0] ?? false
});

const paletteOf = (blocks: ReadonlyArray<readonly [string, BlockStateDefinition[]]>): BlockPalette =>
    new BlockPalette(blocks.map(([identifier, states]) => [identifier, new BlockStateModel(states)] as const));

const client = (): BlockPalette =>
    paletteOf([
        ['minecraft:stone', []],
        ['minecraft:redstone_lamp', [lit([false, true])]]
    ]);

describe('network', () => {
    describe('assertContentPaletteAgrees', () => {
        it('accepts a palette that matches the client block for block', () => {
            expect(() => assertContentPaletteAgrees(client(), client())).not.toThrow();
        });

        it('accepts a block this server invented, which the client learns from Block Properties', () => {
            const content = paletteOf([
                ['minecraft:stone', []],
                ['minecraft:redstone_lamp', [lit([false, true])]],
                ['mypack:lamp', [lit([false, true])]]
            ]);

            expect(() => assertContentPaletteAgrees(content, client())).not.toThrow();
        });

        it('refuses a vanilla block whose state values differ from the client ones', () => {
            const content = paletteOf([
                ['minecraft:stone', []],
                ['minecraft:redstone_lamp', [lit([true, false])]]
            ]);

            expect(() => assertContentPaletteAgrees(content, client())).toThrow(ContentPaletteError);
        });

        it('names every disagreement, not only the first', () => {
            const content = paletteOf([
                ['minecraft:stone', [lit([false, true])]],
                ['minecraft:granite', []]
            ]);

            try {
                assertContentPaletteAgrees(content, client());
                expect.unreachable('the palette disagrees in three places');
            } catch (error: unknown) {
                if (!(error instanceof ContentPaletteError)) throw error;
                // In palette order, which is identifier order, then the
                // blocks only the client has.
                expect(error.disagreements.map(({ block, detail }) => `${block} ${detail}`)).toEqual([
                    'minecraft:granite is in the vanilla namespace but is not a block the client has',
                    "minecraft:stone carries the state lit, which the client's block does not",
                    'minecraft:redstone_lamp is a block the client has and the content build does not'
                ]);
            }
        });
    });
});
