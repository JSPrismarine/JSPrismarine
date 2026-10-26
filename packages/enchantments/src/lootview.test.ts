import { PredicateContext, parseItemModifier, parsePredicate, scriptedRandom } from '@jsprismarine/predicates';
import type { ItemStack } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { VANILLA_ENCHANTMENT_TAGS, vanillaDefinitions, vanillaRegistry } from '../test/fixtures';
import { createEnchantmentView } from './lootview';
import { EnchantmentRegistry } from './registry';

const ITEM_TAGS: Readonly<Record<string, readonly string[]>> = {
    'minecraft:diamond_pickaxe': [
        'minecraft:enchantable/mining',
        'minecraft:enchantable/mining_loot',
        'minecraft:enchantable/durability'
    ]
};

const registry = () => vanillaRegistry(ITEM_TAGS);

const tool = (enchantments: Readonly<Record<string, number>>): ItemStack => ({
    id: 'minecraft:diamond_pickaxe',
    count: 1,
    components: new Map<string, unknown>([['minecraft:enchantments', { levels: enchantments }]])
});

const ore = (id: string): ItemStack => ({ id, count: 1, components: new Map() });

/** A block loot context with the tool in hand, which is what `apply_bonus` reads. */
const blockContext = (held: ItemStack, draws: readonly number[]) =>
    new PredicateContext({
        parameterSet: 'block',
        parameters: { block_state: { name: 'minecraft:diamond_ore' }, origin: { x: 0, y: 12, z: 0 }, tool: held },
        enchantments: createEnchantmentView(registry()),
        random: scriptedRandom(draws)
    });

describe('the enchantment level lookup the loot functions need', () => {
    it('reads the level off a stack', () => {
        const view = createEnchantmentView(registry());
        expect(view.levelOn?.(tool({ 'minecraft:fortune': 3 }), 'minecraft:fortune')).toBe(3);
        expect(view.levelOn?.(tool({}), 'minecraft:fortune')).toBe(0);
    });

    it('reports the highest level an enchantment reaches', () => {
        const view = createEnchantmentView(registry());
        expect(view.maxLevel?.('minecraft:fortune')).toBe(3);
        expect(view.maxLevel?.('example:unknown')).toBeUndefined();
    });

    it('offers every supported enchantment when no random loot tag is loaded', () => {
        const offered = createEnchantmentView(registry()).applicableTo?.(tool({})) ?? [];

        expect(offered).toContain('minecraft:fortune');
        expect(offered).toContain('minecraft:mending');
    });

    it('narrows the random loot draw to the tag when one is loaded', () => {
        const withTag = new EnchantmentRegistry({
            definitions: vanillaDefinitions(),
            tags: new Map([
                ...VANILLA_ENCHANTMENT_TAGS,
                ['minecraft:on_random_loot', ['minecraft:fortune', 'minecraft:sharpness']]
            ]),
            items: { tagsOf: (itemId) => ITEM_TAGS[itemId] ?? [] }
        });

        expect(createEnchantmentView(withTag).applicableTo?.(tool({}))).toEqual(['minecraft:fortune']);
    });

    it('omits the table draw until a caller supplies randomness', () => {
        expect(createEnchantmentView(registry()).selectRandomEnchantments).toBeUndefined();
        expect(
            createEnchantmentView(registry(), { random: scriptedRandom([0.5]) }).selectRandomEnchantments
        ).toBeTypeOf('function');
    });
});

describe('feeding apply_bonus, which is how fortune works at all', () => {
    const oreDrops = {
        type: 'minecraft:apply_bonus',
        enchantment: 'minecraft:fortune',
        formula: 'minecraft:ore_drops'
    };

    it('multiplies the drop by the ore_drops roll at the tool level', () => {
        // ore_drops draws nextInt(level + 2) - 1 and multiplies by at least one.
        // At fortune 3 the bound is 5; a draw of 4 gives a bonus of 3, so four drops.
        const { value: modifier, diagnostics } = parseItemModifier(oreDrops);
        expect(diagnostics).toEqual([]);

        const result = modifier(ore('minecraft:diamond'), blockContext(tool({ 'minecraft:fortune': 3 }), [0.9]));
        expect(result?.count).toBe(4);
    });

    it('leaves the drop alone with no fortune on the tool', () => {
        const { value: modifier } = parseItemModifier(oreDrops);
        const result = modifier(ore('minecraft:diamond'), blockContext(tool({}), [0.9]));

        expect(result?.count).toBe(1);
    });

    it('never drops below the unenchanted count', () => {
        // A draw of 0 gives a bonus of -1, which the formula clamps back to one.
        const { value: modifier } = parseItemModifier(oreDrops);
        const result = modifier(ore('minecraft:diamond'), blockContext(tool({ 'minecraft:fortune': 3 }), [0]));

        expect(result?.count).toBe(1);
    });

    it('does not repeat the bonus arithmetic in this package', () => {
        // The level is all this package supplies; the modifier owns the rest.
        const view = createEnchantmentView(registry());
        expect(Object.keys(view).toSorted()).toEqual(['applicableTo', 'levelOn', 'maxLevel']);
    });
});

describe('feeding table_bonus, the other half of the loot interaction', () => {
    it('reads the chance at the tool level', () => {
        // Chances are indexed by level, so fortune 2 picks the third entry.
        const { value: condition, diagnostics } = parsePredicate({
            type: 'minecraft:table_bonus',
            enchantment: 'minecraft:fortune',
            chances: [0.1, 0.2, 1.0, 1.0]
        });
        expect(diagnostics).toEqual([]);

        expect(condition(blockContext(tool({ 'minecraft:fortune': 2 }), [0.95]))).toBe(true);
        expect(condition(blockContext(tool({ 'minecraft:fortune': 0 }), [0.95]))).toBe(false);
    });
});
