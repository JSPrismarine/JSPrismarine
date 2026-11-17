import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bedrockLiquidReactionOf } from './geometry';
import type { BlockTypeWaterRow, WaterAnswers } from './liquidReactions';
import { liquidReactionOfWater, liquidReactionsOf } from './liquidReactions';
import table from './tables/blockLiquidReactions.json' with { type: 'json' };

const answers = (overrides: Partial<WaterAnswers>): WaterAnswers => ({
    contain: false,
    blocking: false,
    destroyed: false,
    spawns: false,
    ...overrides
});

const row = (id: string, water: WaterAnswers, waterPermutations: BlockTypeWaterRow['waterPermutations'] = []) => ({
    id,
    water,
    waterPermutations
});

describe('liquidReactionOfWater', () => {
    it('dams water with a block that blocks it, waterlogged or not', () => {
        expect(liquidReactionOfWater(answers({ blocking: true }))).toBe('blocking');
        expect(liquidReactionOfWater(answers({ blocking: true, contain: true }))).toBe('blocking');
    });

    it('pops a block whose spread drops it', () => {
        expect(liquidReactionOfWater(answers({ spawns: true }))).toBe('popped');
        expect(liquidReactionOfWater(answers({ spawns: true, contain: true }))).toBe('popped');
    });

    it('breaks a block the spread destroys without a drop', () => {
        expect(liquidReactionOfWater(answers({ destroyed: true }))).toBe('broken');
    });

    it('shares the cell with a block water neither blocks nor destroys', () => {
        expect(liquidReactionOfWater(answers({}))).toBe('none');
        expect(liquidReactionOfWater(answers({ contain: true }))).toBe('none');
    });
});

describe('liquidReactionsOf', () => {
    it('keys each block type by identifier in sorted order', () => {
        const reactions = liquidReactionsOf([
            row('minecraft:wheat', answers({ spawns: true })),
            row('minecraft:stone', answers({ blocking: true }))
        ]);
        expect(Object.entries(reactions)).toEqual([
            ['minecraft:stone', 'blocking'],
            ['minecraft:wheat', 'popped']
        ]);
    });

    it('keeps one reaction when a state differs only in holding water', () => {
        const reactions = liquidReactionsOf([
            row('minecraft:oak_slab', answers({ blocking: true }), [
                { states: { 'minecraft:vertical_half': 'top' }, water: answers({ blocking: true, contain: true }) }
            ])
        ]);
        expect(reactions['minecraft:oak_slab']).toBe('blocking');
    });

    it('refuses a block that reacts differently in some state, and names the state', () => {
        expect(() =>
            liquidReactionsOf([
                row('plugin:half_plant', answers({ blocking: true }), [
                    { states: { 'plugin:grown': false }, water: answers({ spawns: true }) }
                ])
            ])
        ).toThrow('plugin:half_plant is blocking by default but reacts differently in {"plugin:grown":false}');
    });

    it('refuses a block type the capture lists twice', () => {
        const stone = row('minecraft:stone', answers({ blocking: true }));
        expect(() => liquidReactionsOf([stone, stone])).toThrow('minecraft:stone appears twice');
    });
});

describe('the committed liquid reaction table', () => {
    const bedrockData = join(import.meta.dirname, '../../bedrock-data');
    // Parsed JSON the capture job wrote: the default protocol and the rows of its block registry.
    const { defaultProtocolVersion } = JSON.parse(readFileSync(join(bedrockData, 'sources.json'), 'utf8')).bds;
    const capture = JSON.parse(
        readFileSync(join(bedrockData, `src/jsp/v${defaultProtocolVersion}/bedrock/block-types.json`), 'utf8')
    );

    it('matches a fresh run over the capture', () => {
        expect(table.blocks).toEqual(liquidReactionsOf(capture.rows));
    });

    it('answers bedrockLiquidReactionOf for every captured block type', () => {
        for (const [identifier, reaction] of Object.entries(table.blocks)) {
            expect(bedrockLiquidReactionOf(identifier)).toBe(reaction);
        }
    });
});
