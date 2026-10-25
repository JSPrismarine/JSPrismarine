import { describe, expect, it } from 'vitest';

import { bedrockBlockStateToJava, bedrockBlockToJava, javaBlockStateToBedrock } from './blockMapping';
import { BEDROCK_ONLY_BLOCKS } from './blockProperties';
import { blocksTable } from './tables';

/** Every Bedrock identifier the forward direction can produce. */
const paletteIdentifiers = blocksTable.statePalette.map(([name]) => `minecraft:${name}`);

describe('bedrockBlockStateToJava', () => {
    it('maps a stateless block back to the Java block of the same name', () => {
        expect(bedrockBlockStateToJava('minecraft:stone')).toEqual({
            kind: 'mapped',
            java: { name: 'minecraft:stone', properties: {} }
        });
    });

    it('recovers the Java state a Bedrock-only identifier stands for', () => {
        // Bedrock splits the double slab off into its own block; Java states it
        // as `type=double` inside the one slab block.
        expect(bedrockBlockStateToJava('minecraft:black_concrete_double_slab')).toEqual({
            kind: 'mapped',
            java: { name: 'minecraft:black_concrete_slab', properties: { type: 'double', waterlogged: 'false' } }
        });
    });

    it('reads the Java block out of the state rather than the identifier', () => {
        // One Bedrock torch is two Java blocks, and only `torch_facing_direction` says which.
        expect(bedrockBlockStateToJava('minecraft:torch', { torch_facing_direction: 'top' })).toEqual({
            kind: 'mapped',
            java: { name: 'minecraft:torch', properties: {} }
        });
        expect(bedrockBlockStateToJava('minecraft:torch', { torch_facing_direction: 'east' })).toEqual({
            kind: 'mapped',
            java: { name: 'minecraft:wall_torch', properties: { facing: 'west' } }
        });
    });

    it('translates a Bedrock value back into the Java word it spells', () => {
        // Bedrock counts candles from zero and Java from one.
        expect(bedrockBlockStateToJava('minecraft:white_candle', { candles: 3, lit: 1 })).toEqual({
            kind: 'mapped',
            java: {
                name: 'minecraft:white_candle',
                properties: { candles: '4', lit: 'true', waterlogged: 'false' }
            }
        });
    });

    it('takes a boolean where the palette holds the same state as 0 or 1', () => {
        expect(bedrockBlockStateToJava('minecraft:white_candle', { candles: 0, lit: true })).toEqual(
            bedrockBlockStateToJava('minecraft:white_candle', { candles: 0, lit: 1 })
        );
    });

    it('ignores state names the block does not carry', () => {
        expect(bedrockBlockStateToJava('minecraft:stone', { nonsense: 7 })).toEqual(
            bedrockBlockStateToJava('minecraft:stone')
        );
    });

    it('returns unknown for an identifier no Java block reaches', () => {
        expect(bedrockBlockStateToJava('minecraft:element_1')).toEqual({
            kind: 'unknown',
            bedrockId: 'minecraft:element_1'
        });
        expect(bedrockBlockStateToJava('myaddon:ruby_block').kind).toBe('unknown');
    });

    it('round trips every Bedrock state the Java palette reaches', () => {
        const wrong: string[] = [];
        for (const [name, keys, tuples] of blocksTable.statePalette) {
            const bedrockId = `minecraft:${name}`;
            for (const values of tuples) {
                const states = Object.fromEntries(keys.map((key, axis) => [key, values[axis] ?? '']));
                const java = bedrockBlockStateToJava(bedrockId, states);
                if (java.kind !== 'mapped') {
                    wrong.push(`${bedrockId} has no Java source`);
                    continue;
                }

                const back = javaBlockStateToBedrock(java.java.name, java.java.properties);
                if (back.kind === 'unknown' || back.bedrock.name !== bedrockId) {
                    wrong.push(`${bedrockId} ${JSON.stringify(states)} came back as ${JSON.stringify(back)}`);
                }
            }
        }

        expect(wrong).toEqual([]);
    });
});

describe('bedrockBlockToJava', () => {
    it('lists every Java block a Bedrock identifier stands for, alphabetically', () => {
        expect(bedrockBlockToJava('minecraft:torch')).toEqual(['minecraft:torch', 'minecraft:wall_torch']);
        expect(bedrockBlockToJava('minecraft:air')).toEqual([
            'minecraft:air',
            'minecraft:cave_air',
            'minecraft:void_air'
        ]);
    });

    it('lists the parent block of an identifier Bedrock split off', () => {
        expect(bedrockBlockToJava('minecraft:lit_furnace')).toEqual(['minecraft:furnace']);
        expect(bedrockBlockToJava('minecraft:black_concrete_double_slab')).toEqual(['minecraft:black_concrete_slab']);
    });

    it('is empty for a Bedrock-only block', () => {
        expect(bedrockBlockToJava('minecraft:element_1')).toEqual([]);
    });

    it('answers for every identifier the forward direction produces', () => {
        const unreached = paletteIdentifiers.filter((id) => bedrockBlockToJava(id).length === 0);

        expect(unreached).toEqual([]);
    });

    it('agrees with the generated Bedrock-only list', () => {
        const reached = paletteIdentifiers.filter((id) => BEDROCK_ONLY_BLOCKS.has(id));

        expect(reached).toEqual([]);
    });
});
