import { describe, expect, it } from 'vitest';

import { LootSequences, lootSequenceRandom } from './random';

/**
 * The expected numbers are Java's own. They come from the oracle vectors in
 * `packages/worldgen/vectors/random.json`, produced by running Java 26.3's
 * `XoroshiroRandomSource` over fixed seeds. A loot table with no
 * `random_sequence` seeds exactly the way `RandomSource.create(worldSeed)`
 * does, so those vectors apply to this package unchanged.
 */
const take = <T>(count: number, next: () => T): T[] => Array.from({ length: count }, next);

describe('the loot random sequence', () => {
    it('draws Java floats for a world seed with no sequence id', () => {
        const random = lootSequenceRandom(0n);

        const drawn = take(5, () => random.nextFloat());

        for (const [index, expected] of [0.16474366, 0.7997457, 0.25119615, 0.117124856, 0.09971243].entries()) {
            expect(drawn[index]).toBeCloseTo(expected, 7);
        }
    });

    it('draws Java bounded integers for a world seed with no sequence id', () => {
        const random = lootSequenceRandom(0n);

        expect(take(8, () => random.nextInt(3))).toEqual([2, 0, 0, 0, 2, 2, 0, 0]);
    });

    it('gives a table its own stream, keyed by the sequence id', () => {
        const unkeyed = lootSequenceRandom(0n);
        const keyed = lootSequenceRandom(0n, 'minecraft:blocks/coal_ore');

        expect(take(4, () => keyed.nextFloat())).not.toEqual(take(4, () => unkeyed.nextFloat()));
    });

    it('reproduces a stream for the same world seed and sequence id', () => {
        const first = lootSequenceRandom(7n, 'minecraft:chests/simple_dungeon');
        const second = lootSequenceRandom(7n, 'minecraft:chests/simple_dungeon');

        expect(take(16, () => first.nextFloat())).toEqual(take(16, () => second.nextFloat()));
    });

    it('separates two sequence ids under one world seed', () => {
        const ore = lootSequenceRandom(7n, 'minecraft:blocks/coal_ore');
        const dungeon = lootSequenceRandom(7n, 'minecraft:chests/simple_dungeon');

        expect(take(8, () => ore.nextFloat())).not.toEqual(take(8, () => dungeon.nextFloat()));
    });

    it('separates two world seeds under one sequence id', () => {
        const first = lootSequenceRandom(1n, 'minecraft:blocks/coal_ore');
        const second = lootSequenceRandom(2n, 'minecraft:blocks/coal_ore');

        expect(take(8, () => first.nextFloat())).not.toEqual(take(8, () => second.nextFloat()));
    });
});

describe('the sequence cache', () => {
    it('advances one stream across repeated draws for the same id', () => {
        const sequences = new LootSequences(7n);
        const standalone = lootSequenceRandom(7n, 'minecraft:blocks/coal_ore');
        const expected = take(4, () => standalone.nextFloat());

        const drawn = take(4, () => sequences.forSequence('minecraft:blocks/coal_ore').nextFloat());

        expect(drawn).toEqual(expected);
    });

    it('keeps one stream per sequence id', () => {
        const sequences = new LootSequences(7n);

        const first = sequences.forSequence('minecraft:blocks/coal_ore');

        expect(sequences.forSequence('minecraft:chests/simple_dungeon')).not.toBe(first);
        expect(sequences.forSequence('minecraft:blocks/coal_ore')).toBe(first);
    });

    it('shares one unkeyed stream for every table without a sequence id', () => {
        const sequences = new LootSequences(7n);

        expect(sequences.forSequence(undefined)).toBe(sequences.forSequence(undefined));
    });

    it('reproduces the whole cache for the same world seed', () => {
        const first = new LootSequences(99n);
        const second = new LootSequences(99n);
        const draw = (sequences: LootSequences): number[] => [
            sequences.forSequence('minecraft:blocks/coal_ore').nextFloat(),
            sequences.forSequence('minecraft:chests/simple_dungeon').nextFloat(),
            sequences.forSequence('minecraft:blocks/coal_ore').nextFloat()
        ];

        expect(draw(first)).toEqual(draw(second));
    });
});
