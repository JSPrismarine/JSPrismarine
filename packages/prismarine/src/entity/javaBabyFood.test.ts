import { EntityTypes } from '@jsprismarine/entities';
import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { buildContentTags } from '../content/tags';
import { javaBabyFoods, withJavaBabyFood } from './javaBabyFood';

const tagFile = (identifier: string, values: readonly string[]): readonly [string, Definition] => [
    identifier,
    { identifier, registry: 'tags', pack: 'vanilla', path: `data/${identifier}.json`, data: { values } }
];

const tags = buildContentTags(
    new Map([
        tagFile('item/minecraft:fishes', ['minecraft:cod', 'minecraft:salmon', 'minecraft:pufferfish']),
        tagFile('item/minecraft:wolf_food', ['minecraft:beef', '#minecraft:fishes']),
        tagFile('item/minecraft:camel_food', ['minecraft:cactus'])
    ])
);

const babyFile = (identifier: string, feedItems: unknown) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components: { 'minecraft:ageable': { duration: 1200, feed_items: feedItems } }
    }
});

/** The ticks a baby has left after eating `item` with `ticksLeft` to go, or undefined when it refuses the item. */
const leftAfter = (data: unknown, identifier: string, item: string, ticksLeft: number): number | undefined => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'test', path: 'entities/test.json' }]);
    const baby = types.spawn(identifier);
    baby.componentState.write('minecraft:ageable', { remaining: ticksLeft, paused: false });
    if (!baby.interactWithItem(item)) return undefined;
    const remaining = baby.componentState.snapshot()['minecraft:ageable'];
    return typeof remaining === 'object' && remaining !== null && 'remaining' in remaining
        ? Number(remaining.remaining)
        : undefined;
};

describe('withJavaBabyFood', () => {
    it("grows a cria Java's 10 seconds on wheat and 90 on a hay bale, where Bedrock's pack gives a tenth and nine tenths", () => {
        const data = withJavaBabyFood(
            babyFile('minecraft:llama', [
                { item: 'wheat', growth: 0.1 },
                { item: 'hay_block', growth: 0.9 }
            ]),
            javaBabyFoods(tags)
        );

        expect(leftAfter(data, 'minecraft:llama', 'minecraft:wheat', 24000)).toBe(24000 - 200);
        expect(leftAfter(data, 'minecraft:llama', 'minecraft:hay_block', 6000)).toBe(6000 - 1800);
    });

    it('grows a camel calf 10 seconds for each cactus, whatever time it has left', () => {
        const data = withJavaBabyFood(babyFile('minecraft:camel', 'cactus'), javaBabyFoods(tags));

        expect(leftAfter(data, 'minecraft:camel', 'minecraft:cactus', 24000)).toBe(23800);
        expect(leftAfter(data, 'minecraft:camel', 'minecraft:cactus', 6000)).toBe(5800);
    });

    it("feeds a wolf pup Java's wolf_food, fish and all, by a tenth of the time left", () => {
        const data = withJavaBabyFood(babyFile('minecraft:wolf', ['beef']), javaBabyFoods(tags));

        expect(leftAfter(data, 'minecraft:wolf', 'minecraft:cod', 24000)).toBe(24000 - 120 * 20);
        expect(leftAfter(data, 'minecraft:wolf', 'minecraft:beef', 6000)).toBe(6000 - 30 * 20);
    });

    it('feeds a dolphin calf anything in minecraft:fishes, which Bedrock lists as cod and salmon only', () => {
        const data = withJavaBabyFood(babyFile('minecraft:dolphin', ['fish', 'salmon']), javaBabyFoods(tags));

        expect(leftAfter(data, 'minecraft:dolphin', 'minecraft:pufferfish', 24000)).toBe(21600);
    });

    it('returns a file with no Java rule unchanged', () => {
        const data = babyFile('minecraft:squid', ['fish']);
        expect(withJavaBabyFood(data, javaBabyFoods(tags))).toBe(data);
    });
});
