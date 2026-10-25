import { DiagnosticCollector } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { parseAdvancement } from './model';

const minimal = {
    criteria: { got_stone: { trigger: 'minecraft:inventory_changed', conditions: { items: [{ items: 'stone' }] } } }
};

describe('parsing an advancement', () => {
    it('namespaces the id and the parent', () => {
        const { value } = parseAdvancement('story/mine_stone', { ...minimal, parent: 'story/root' });

        expect(value?.id).toBe('minecraft:story/mine_stone');
        expect(value?.parent).toBe('minecraft:story/root');
    });

    it('leaves the parent absent on a root', () => {
        const { value } = parseAdvancement('minecraft:story/root', minimal);

        expect(value?.parent).toBeUndefined();
    });

    it('compiles each criterion under its trigger', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', minimal);

        expect(diagnostics).toEqual([]);
        expect(value?.criteria.get('got_stone')?.trigger).toBe('inventory_changed');
    });

    it('accepts a trigger written without its namespace', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', {
            criteria: { t: { trigger: 'tick' } }
        });

        expect(diagnostics).toEqual([]);
        expect(value?.criteria.get('t')?.trigger).toBe('tick');
    });

    it('reports an unknown trigger and drops the criterion', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', {
            criteria: { bad: { trigger: 'minecraft:does_not_exist' }, t: { trigger: 'minecraft:tick' } }
        });

        expect(value?.criteria.has('bad')).toBe(false);
        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.criteria.bad.trigger',
            message: 'unknown trigger type minecraft:does_not_exist'
        });
    });

    it('yields no advancement when every criterion is unusable', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', { criteria: {} });

        expect(value).toBeUndefined();
        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.criteria',
            message: 'an advancement needs at least one criterion'
        });
    });

    it('defaults requirements to one group per criterion', () => {
        const { value } = parseAdvancement('minecraft:a', {
            criteria: { one: { trigger: 'minecraft:tick' }, two: { trigger: 'minecraft:tick' } }
        });

        expect(value?.requirements).toEqual([['one'], ['two']]);
    });

    it('keeps a written requirements matrix', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', {
            criteria: { one: { trigger: 'minecraft:tick' }, two: { trigger: 'minecraft:tick' } },
            requirements: [['one', 'two']]
        });

        expect(diagnostics).toEqual([]);
        expect(value?.requirements).toEqual([['one', 'two']]);
    });

    it('reports a requirement that names no criterion', () => {
        const { diagnostics } = parseAdvancement('minecraft:a', {
            criteria: { one: { trigger: 'minecraft:tick' } },
            requirements: [['one'], ['missing']]
        });

        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.requirements[1][0]',
            message: 'requirement missing names no criterion of this advancement'
        });
    });

    it('reports a criterion left out of every requirement group', () => {
        const { diagnostics } = parseAdvancement('minecraft:a', {
            criteria: { one: { trigger: 'minecraft:tick' }, two: { trigger: 'minecraft:tick' } },
            requirements: [['one']]
        });

        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.requirements',
            message: 'criterion two appears in no requirement group'
        });
    });

    it('reports an empty requirement group', () => {
        const { diagnostics } = parseAdvancement('minecraft:a', {
            criteria: { one: { trigger: 'minecraft:tick' } },
            requirements: [['one'], []]
        });

        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.requirements[1]',
            message: 'a requirement group cannot be empty'
        });
    });
});

describe('the display block', () => {
    it("takes Java's defaults for the four flags it leaves out", () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', {
            ...minimal,
            display: { icon: { id: 'wooden_pickaxe' }, title: 'Title', description: 'Description' }
        });

        expect(diagnostics).toEqual([]);
        expect(value?.display).toEqual({
            icon: { id: 'minecraft:wooden_pickaxe', count: 1, components: undefined },
            title: 'Title',
            description: 'Description',
            background: undefined,
            frame: 'task',
            showToast: true,
            announceToChat: true,
            hidden: false
        });
    });

    it('reads the frame, the background and the three flags when they are written', () => {
        const { value } = parseAdvancement('minecraft:a', {
            ...minimal,
            display: {
                icon: { id: 'minecraft:nether_star', count: 2 },
                title: { translate: 'a.title' },
                description: { translate: 'a.description' },
                background: 'minecraft:block/nether_bricks',
                frame: 'challenge',
                show_toast: false,
                announce_to_chat: false,
                hidden: true
            }
        });

        expect(value?.display?.frame).toBe('challenge');
        expect(value?.display?.background).toBe('minecraft:block/nether_bricks');
        expect(value?.display?.showToast).toBe(false);
        expect(value?.display?.announceToChat).toBe(false);
        expect(value?.display?.hidden).toBe(true);
        expect(value?.display?.icon.count).toBe(2);
    });

    it('reports an unknown frame and falls back to task', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', {
            ...minimal,
            display: { icon: { id: 'stone' }, title: 'T', description: 'D', frame: 'legendary' }
        });

        expect(value?.display?.frame).toBe('task');
        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.display.frame',
            message: 'unknown advancement frame legendary'
        });
    });

    it('drops a display with no icon and keeps the advancement', () => {
        const { value, diagnostics } = parseAdvancement('minecraft:a', {
            ...minimal,
            display: { title: 'T', description: 'D' }
        });

        expect(value).toBeDefined();
        expect(value?.display).toBeUndefined();
        expect(diagnostics).toContainEqual({
            severity: 'error',
            path: 'minecraft:a.display.icon',
            message: 'an advancement icon needs an item id'
        });
    });
});

describe('the rewards block', () => {
    it('is empty when the file writes none', () => {
        const { value } = parseAdvancement('minecraft:a', minimal);

        expect(value?.rewards).toEqual({ experience: 0, lootTables: [], recipes: [], function: undefined });
    });

    it('reads experience, recipes and a function id', () => {
        const { value } = parseAdvancement('minecraft:a', {
            ...minimal,
            rewards: { experience: 100, recipes: ['stone_slab'], function: 'custom:on_complete' }
        });

        expect(value?.rewards.experience).toBe(100);
        expect(value?.rewards.recipes).toEqual(['minecraft:stone_slab']);
        expect(value?.rewards.function).toBe('custom:on_complete');
    });

    it('expands a loot table tag through the resolver', () => {
        const diagnostics = new DiagnosticCollector();
        const { value } = parseAdvancement(
            'minecraft:a',
            { ...minimal, rewards: { loot: '#minecraft:gifts' } },
            {
                diagnostics,
                resolver: { tag: () => ['minecraft:gameplay/hero_of_the_village/armorer_gift'] }
            }
        );

        expect(value?.rewards.lootTables).toEqual(['minecraft:gameplay/hero_of_the_village/armorer_gift']);
        expect(diagnostics.errors).toEqual([]);
    });
});

describe('the recipe-unlock index key', () => {
    it('collects the recipe ids a recipe_unlocked criterion matches', () => {
        const { value } = parseAdvancement('minecraft:recipes/building_blocks/stone_slab', {
            criteria: { has_recipe: { trigger: 'minecraft:recipe_unlocked', conditions: { recipes: 'stone_slab' } } }
        });

        expect(value?.criteria.get('has_recipe')?.keys).toEqual(['minecraft:stone_slab']);
    });

    it('leaves a trigger with no keyed field unindexed', () => {
        const { value } = parseAdvancement('minecraft:a', { criteria: { t: { trigger: 'minecraft:tick' } } });

        expect(value?.criteria.get('t')?.keys).toBeUndefined();
    });
});
