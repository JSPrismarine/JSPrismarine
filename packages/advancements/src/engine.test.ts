import { DiagnosticCollector } from '@jsprismarine/predicates';
import type { EntityView, RandomSource } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { AdvancementEngine } from './engine';
import type { RewardHooks } from './engine';
import { parseAdvancement } from './model';
import type { ParsedAdvancement } from './model';
import { PlayerAdvancements } from './progress';
import type { TriggerName } from './triggers';

const player: EntityView = { type: 'minecraft:player', position: { x: 0, y: 64, z: 0 } };

const parse = (id: string, json: unknown): ParsedAdvancement => {
    const { value, diagnostics } = parseAdvancement(id, json);
    if (!value) throw new Error(`the fixture ${id} did not parse: ${JSON.stringify(diagnostics)}`);
    return value;
};

/** A random source that records how often the evaluator drew from it. */
const countingRandom = (): RandomSource & { readonly draws: () => number } => {
    let draws = 0;
    return {
        nextFloat: () => {
            draws += 1;
            return 0;
        },
        nextInt: () => {
            draws += 1;
            return 0;
        },
        draws: () => draws
    };
};

/** A criterion whose only condition draws once from the random source, so evaluations are countable. */
const counted = (trigger: TriggerName, conditions: Readonly<Record<string, unknown>> = {}): unknown => ({
    trigger: `minecraft:${trigger}`,
    conditions: { ...conditions, player: { type: 'minecraft:random_chance', chance: 1 } }
});

describe('raising an event', () => {
    it('completes a single-criterion advancement and names it', () => {
        const engine = new AdvancementEngine();
        engine.load([parse('minecraft:story/root', { criteria: { t: { trigger: 'minecraft:tick' } } })]);
        const progress = new PlayerAdvancements();

        expect(engine.raise('tick', { player }, progress)).toEqual(['minecraft:story/root']);
        expect(progress.hasCriterion('minecraft:story/root', 't')).toBe(true);
    });

    it('waits for every requirement group before it completes', () => {
        const engine = new AdvancementEngine();
        engine.load([
            parse('minecraft:a', {
                criteria: {
                    ticked: { trigger: 'minecraft:tick' },
                    slept: { trigger: 'minecraft:slept_in_bed' }
                },
                requirements: [['ticked'], ['slept']]
            })
        ]);
        const progress = new PlayerAdvancements();

        expect(engine.raise('tick', { player }, progress)).toEqual([]);
        expect(engine.raise('slept_in_bed', { player }, progress)).toEqual(['minecraft:a']);
    });

    it('completes on the first satisfied member of an or group', () => {
        const engine = new AdvancementEngine();
        engine.load([
            parse('minecraft:a', {
                criteria: {
                    ticked: { trigger: 'minecraft:tick' },
                    slept: { trigger: 'minecraft:slept_in_bed' }
                },
                requirements: [['ticked', 'slept']]
            })
        ]);
        const progress = new PlayerAdvancements();

        expect(engine.raise('slept_in_bed', { player }, progress)).toEqual(['minecraft:a']);
    });

    it('completes an advancement once and no more', () => {
        const engine = new AdvancementEngine();
        engine.load([parse('minecraft:a', { criteria: { t: { trigger: 'minecraft:tick' } } })]);
        const progress = new PlayerAdvancements();

        expect(engine.raise('tick', { player }, progress)).toEqual(['minecraft:a']);
        expect(engine.raise('tick', { player }, progress)).toEqual([]);
    });

    it('records nothing when the conditions do not match', () => {
        const engine = new AdvancementEngine();
        engine.load([
            parse('minecraft:a', {
                criteria: {
                    t: {
                        trigger: 'minecraft:tick',
                        conditions: {
                            player: {
                                type: 'minecraft:entity_properties',
                                entity: 'this',
                                predicate: { 'minecraft:entity_type': 'minecraft:villager' }
                            }
                        }
                    }
                }
            })
        ]);
        const progress = new PlayerAdvancements();

        expect(engine.raise('tick', { player }, progress)).toEqual([]);
        expect(progress.hasCriterion('minecraft:a', 't')).toBe(false);
    });
});

describe('the dispatch index', () => {
    it('evaluates only the criteria registered under the raised trigger', () => {
        const random = countingRandom();
        const engine = new AdvancementEngine({ random });
        const noise = Array.from({ length: 5000 }, (_value, index) =>
            parse(`minecraft:noise/${index}`, { criteria: { c: counted('inventory_changed') } })
        );
        engine.load([...noise, parse('minecraft:listener', { criteria: { c: counted('tick') } })]);

        engine.raise('tick', { player }, new PlayerAdvancements());

        expect(random.draws()).toBe(1);
    });

    it('is unchanged by how many criteria other triggers hold', () => {
        const measure = (noiseCount: number): number => {
            const random = countingRandom();
            const engine = new AdvancementEngine({ random });
            const noise = Array.from({ length: noiseCount }, (_value, index) =>
                parse(`minecraft:noise/${index}`, { criteria: { c: counted('inventory_changed') } })
            );
            engine.load([
                ...noise,
                parse('minecraft:one', { criteria: { c: counted('tick') } }),
                parse('minecraft:two', { criteria: { c: counted('tick') } })
            ]);
            engine.raise('tick', { player }, new PlayerAdvancements());
            return random.draws();
        };

        expect(measure(10)).toBe(2);
        expect(measure(5000)).toBe(2);
    });

    it('turns a recipe unlock into a lookup rather than a scan', () => {
        const random = countingRandom();
        const engine = new AdvancementEngine({ random });
        const recipes = Array.from({ length: 1739 }, (_value, index) =>
            parse(`minecraft:recipes/r${index}`, {
                criteria: { has_the_recipe: counted('recipe_unlocked', { recipes: `minecraft:r${index}` }) },
                rewards: { recipes: [`minecraft:r${index}`] }
            })
        );
        engine.load(recipes);

        const completed = engine.raise(
            'recipe_unlocked',
            { player, recipe: 'minecraft:r1200' },
            new PlayerAdvancements()
        );

        expect(completed).toEqual(['minecraft:recipes/r1200']);
        expect(random.draws()).toBe(1);
    });

    it('keeps a recipe criterion reachable through a recipe tag', () => {
        const engine = new AdvancementEngine();
        const { value } = parseAdvancement(
            'minecraft:a',
            {
                criteria: { has: { trigger: 'minecraft:recipe_unlocked', conditions: { recipes: '#minecraft:doors' } } }
            },
            { resolver: { tag: () => ['minecraft:oak_door', 'minecraft:iron_door'] } }
        );
        engine.load([value!]);

        expect(
            engine.raise('recipe_unlocked', { player, recipe: 'minecraft:iron_door' }, new PlayerAdvancements())
        ).toEqual(['minecraft:a']);
        expect(
            engine.raise('recipe_unlocked', { player, recipe: 'minecraft:spruce_door' }, new PlayerAdvancements())
        ).toEqual([]);
    });
});

describe('rewards', () => {
    const rewarding = (rewards: unknown, hooks: RewardHooks, diagnostics = new DiagnosticCollector()): string[] => {
        const engine = new AdvancementEngine({ rewards: hooks, diagnostics });
        engine.load([parse('minecraft:a', { criteria: { t: { trigger: 'minecraft:tick' } }, rewards })]);
        return [...engine.raise('tick', { player }, new PlayerAdvancements())];
    };

    it('grants experience through its hook', () => {
        const granted: number[] = [];
        rewarding({ experience: 100 }, { grantExperience: (_who, amount) => granted.push(amount) });

        expect(granted).toEqual([100]);
    });

    it('unlocks every reward recipe through its hook', () => {
        const unlocked: string[] = [];
        rewarding(
            { recipes: ['stone_slab', 'stone_stairs'] },
            { unlockRecipe: (_who, recipe) => unlocked.push(recipe) }
        );

        expect(unlocked).toEqual(['minecraft:stone_slab', 'minecraft:stone_stairs']);
    });

    it('runs the reward function through its hook', () => {
        const ran: string[] = [];
        rewarding({ function: 'custom:on_complete' }, { runFunction: (_who, id) => ran.push(id) });

        expect(ran).toEqual(['custom:on_complete']);
    });

    it('rolls the reward loot table through its hook', () => {
        const rolled: string[] = [];
        rewarding({ loot: 'minecraft:gameplay/gift' }, { runLootTable: (_who, table) => rolled.push(table) });

        expect(rolled).toEqual(['minecraft:gameplay/gift']);
    });

    it('reports a reward whose hook the host left out', () => {
        const diagnostics = new DiagnosticCollector();
        rewarding({ experience: 10 }, {}, diagnostics);

        expect(diagnostics.entries).toContainEqual({
            severity: 'warning',
            path: 'rewards.experience',
            message: 'no grantExperience hook is bound'
        });
    });

    it('fires once per completion, not once per raise', () => {
        const granted: number[] = [];
        const engine = new AdvancementEngine({ rewards: { grantExperience: (_who, amount) => granted.push(amount) } });
        engine.load([
            parse('minecraft:a', { criteria: { t: { trigger: 'minecraft:tick' } }, rewards: { experience: 5 } })
        ]);
        const progress = new PlayerAdvancements();

        engine.raise('tick', { player }, progress);
        engine.raise('tick', { player }, progress);

        expect(granted).toEqual([5]);
    });
});

describe('awarding by hand', () => {
    it('completes every criterion and fires the rewards', () => {
        const granted: number[] = [];
        const engine = new AdvancementEngine({ rewards: { grantExperience: (_who, amount) => granted.push(amount) } });
        engine.load([
            parse('minecraft:a', {
                criteria: { one: { trigger: 'minecraft:tick' }, two: { trigger: 'minecraft:slept_in_bed' } },
                rewards: { experience: 7 }
            })
        ]);
        const progress = new PlayerAdvancements();

        expect(engine.award('minecraft:a', progress, player)).toBe(true);
        expect(engine.award('minecraft:a', progress, player)).toBe(false);
        expect(granted).toEqual([7]);
        expect(progress.hasCriterion('minecraft:a', 'two')).toBe(true);
    });

    it('reports an id that is not loaded', () => {
        const diagnostics = new DiagnosticCollector();
        const engine = new AdvancementEngine({ diagnostics });
        engine.load([]);

        expect(engine.award('minecraft:missing', new PlayerAdvancements(), player)).toBe(false);
        expect(diagnostics.errors).toHaveLength(1);
    });
});

describe('loading', () => {
    it('builds the parent tree and reports its faults on the engine collector', () => {
        const diagnostics = new DiagnosticCollector();
        const engine = new AdvancementEngine({ diagnostics });
        engine.load([
            parse('minecraft:root', { criteria: { t: { trigger: 'minecraft:tick' } } }),
            parse('minecraft:child', { parent: 'minecraft:root', criteria: { t: { trigger: 'minecraft:tick' } } }),
            parse('minecraft:orphan', { parent: 'minecraft:gone', criteria: { t: { trigger: 'minecraft:tick' } } })
        ]);

        expect(engine.tree.roots.map((node) => node.id)).toEqual(['minecraft:root', 'minecraft:orphan']);
        expect(engine.get('minecraft:child')?.parent).toBe('minecraft:root');
        expect(diagnostics.errors).toHaveLength(1);
    });

    it('replaces everything a previous load registered', () => {
        const engine = new AdvancementEngine();
        engine.load([parse('minecraft:a', { criteria: { t: { trigger: 'minecraft:tick' } } })]);
        engine.load([parse('minecraft:b', { criteria: { t: { trigger: 'minecraft:tick' } } })]);

        expect(engine.raise('tick', { player }, new PlayerAdvancements())).toEqual(['minecraft:b']);
    });
});
