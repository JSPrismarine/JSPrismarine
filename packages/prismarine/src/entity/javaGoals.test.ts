import { EntityTypes } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { javaGoalRulings, withJavaGoals } from './javaGoals';

const entityFile = (
    identifier: string,
    components: Record<string, unknown>,
    groups: Record<string, Record<string, unknown>> = {}
) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components,
        component_groups: groups
    }
});

/** The components an entity loaded from a file declares, read through the real loader. */
const declared = (data: unknown, identifier: string): readonly string[] => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'test', path: 'entities/test.json' }]);
    return types.registry.get(identifier)?.declaredComponents ?? [];
};

describe('withJavaGoals', () => {
    it("gives a creeper Java's SwellGoal distances in its goal and in the sensor that lights the fuse", () => {
        const data = withJavaGoals(
            entityFile(
                'minecraft:creeper',
                {
                    'minecraft:behavior.swell': { priority: 2, start_distance: 2.5, stop_distance: 6 },
                    'minecraft:target_nearby_sensor': { inside_range: 2.5, outside_range: 6, must_see: true }
                },
                { 'minecraft:forced_exploding': { 'minecraft:target_nearby_sensor': {} } }
            ),
            javaGoalRulings()
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                components: {
                    'minecraft:behavior.swell': { priority: 2, start_distance: 3, stop_distance: 7 },
                    'minecraft:target_nearby_sensor': { inside_range: 3, outside_range: 7, must_see: true }
                },
                // The empty sensor switches the base one off, and stays empty.
                component_groups: { 'minecraft:forced_exploding': { 'minecraft:target_nearby_sensor': {} } }
            }
        });
    });

    it('takes off a goal Java registers nothing for, and swaps one Java runs by another rule', () => {
        const panda = withJavaGoals(
            entityFile('minecraft:panda', {
                'minecraft:behavior.random_sitting': { priority: 5 },
                'minecraft:behavior.snacking': { priority: 7 }
            }),
            javaGoalRulings()
        );
        const wither = withJavaGoals(
            entityFile('minecraft:wither', { 'minecraft:behavior.wither_target_highest_damage': { priority: 1 } }),
            javaGoalRulings()
        );

        expect(declared(panda, 'minecraft:panda')).not.toContain('minecraft:behavior.random_sitting');
        expect(declared(panda, 'minecraft:panda')).toContain('minecraft:behavior.snacking');
        expect(declared(wither, 'minecraft:wither')).toEqual(['minecraft:behavior.hurt_by_target']);
        expect(wither).toMatchObject({
            'minecraft:entity': { components: { 'minecraft:behavior.hurt_by_target': { priority: 1 } } }
        });
    });

    it("rolls a panda's sneeze table on every sneeze, as Java's Panda.afterSneeze does", () => {
        const data = withJavaGoals(
            entityFile(
                'minecraft:panda',
                {},
                {
                    'minecraft:panda_sneezing': {
                        'minecraft:behavior.sneeze': {
                            priority: 7,
                            probability: 0.002,
                            drop_item_chance: 0.001,
                            loot_table: 'loot_tables/entities/panda_sneeze.json'
                        }
                    }
                }
            ),
            javaGoalRulings()
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:panda_sneezing': {
                        'minecraft:behavior.sneeze': {
                            probability: 0.002,
                            drop_item_chance: 1,
                            loot_table: 'loot_tables/gameplay/panda_sneeze.json'
                        }
                    }
                }
            }
        });
    });

    it('leaves a file no ruling names unchanged', () => {
        const data = entityFile('test:creeper', { 'minecraft:behavior.swell': { start_distance: 2.5 } });
        expect(withJavaGoals(data, javaGoalRulings())).toBe(data);
    });

    it("gives a fed bee its flower's effect for Java's ticks, where Bedrock's file writes them as seconds", () => {
        const bee = withJavaGoals(
            entityFile(
                'minecraft:bee',
                {},
                {
                    add_poison_effect: {
                        'minecraft:spell_effects': { add_effects: [{ effect: 'poison', duration: 25 }] }
                    },
                    add_wither_effect: {
                        'minecraft:spell_effects': { add_effects: [{ effect: 'wither', duration: 40 }] }
                    }
                }
            ),
            javaGoalRulings()
        );

        expect(bee).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    add_poison_effect: { 'minecraft:spell_effects': { add_effects: [{ duration: 1.25 }] } },
                    add_wither_effect: { 'minecraft:spell_effects': { add_effects: [{ duration: 2 }] } }
                }
            }
        });
    });
});
