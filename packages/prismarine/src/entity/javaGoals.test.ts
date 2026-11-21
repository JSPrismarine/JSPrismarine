import { EntityTypes } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { BLAZE_ATTACK, GHAST_SHOOT_FIREBALL, SHULKER_ATTACK } from '@jsprismarine/entity-goals/goals/mobAttacks';

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

/**
 * A distance just under 3 blocks: `SwellGoal`'s `distanceToSqr < 9` is strict, so a target exactly
 * 3 blocks away does not light the fuse, where a range of 3 would.
 */
const JUST_UNDER_3 = {
    asymmetricMatch: (value: unknown): boolean => typeof value === 'number' && value < 3 && value > 3 - 1e-9,
    toString: () => 'a distance just under 3'
};

describe('withJavaGoals', () => {
    it("adds the goals Java's class registers and the file leaves out, in the base components only", () => {
        const data = withJavaGoals(
            entityFile(
                'minecraft:endermite',
                { 'minecraft:physics': {}, 'minecraft:behavior.float': { priority: 0 } },
                { 'minecraft:baby': { 'minecraft:physics': {} } }
            ),
            javaGoalRulings()
        );

        expect(declared(data, 'minecraft:endermite')).toEqual(
            expect.arrayContaining([
                'minecraft:behavior.look_at_player',
                'minecraft:behavior.random_look_around',
                'minecraft:behavior.hurt_by_target'
            ])
        );
        expect(data).not.toMatchObject({
            'minecraft:entity': {
                component_groups: { 'minecraft:baby': { 'minecraft:behavior.look_at_player': expect.anything() } }
            }
        });
    });

    it("gives a fish the panic Java's AbstractFish registers", () => {
        const data = withJavaGoals(entityFile('minecraft:cod', { 'minecraft:physics': {} }), javaGoalRulings());

        expect(declared(data, 'minecraft:cod')).toContain('minecraft:behavior.panic');
    });

    it("gives a creeper Java's strict SwellGoal distances in its goal and in the sensor that lights the fuse", () => {
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
                    'minecraft:behavior.swell': { priority: 2, start_distance: JUST_UNDER_3, stop_distance: 7 },
                    'minecraft:target_nearby_sensor': {
                        inside_range: JUST_UNDER_3,
                        outside_range: 7,
                        must_see: true
                    }
                },
                // The empty sensor switches the base one off, and stays empty.
                component_groups: { 'minecraft:forced_exploding': { 'minecraft:target_nearby_sensor': {} } }
            }
        });
    });

    it("stalks only a fox's Java prey, from Java's 6 blocks, crouching Java's 15 ticks", () => {
        const data = withJavaGoals(
            entityFile('minecraft:fox', {
                'minecraft:behavior.stalk_and_pounce_on_target': { priority: 7, pounce_max_dist: 5, interest_time: 2 }
            }),
            javaGoalRulings()
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                components: {
                    'minecraft:behavior.stalk_and_pounce_on_target': {
                        priority: 7,
                        stalk_speed: 1.5,
                        pounce_max_dist: 6,
                        interest_time: 0.75,
                        filters: { any_of: [{ value: 'chicken' }, { value: 'rabbit' }] }
                    }
                }
            }
        });
    });

    it("runs the blaze's, the ghast's and the shulker's own Java attack goals in place of Bedrock's", () => {
        const blaze = withJavaGoals(
            entityFile(
                'minecraft:blaze',
                {},
                {
                    mode_switcher: { 'minecraft:target_nearby_sensor': { inside_range: 2 } },
                    melee_mode: { 'minecraft:behavior.melee_box_attack': { priority: 3 } },
                    ranged_mode: { 'minecraft:behavior.ranged_attack': { priority: 3 } }
                }
            ),
            javaGoalRulings()
        );
        const ghast = withJavaGoals(
            entityFile('minecraft:ghast', { 'minecraft:behavior.ranged_attack': { priority: 2 } }),
            javaGoalRulings()
        );
        const shulker = withJavaGoals(
            entityFile('minecraft:shulker', { 'minecraft:behavior.ranged_attack': {} }),
            javaGoalRulings()
        );

        expect([...declared(blaze, 'minecraft:blaze')].sort()).toEqual([
            BLAZE_ATTACK,
            'minecraft:target_nearby_sensor'
        ]);
        expect(declared(ghast, 'minecraft:ghast')).toEqual([GHAST_SHOOT_FIREBALL]);
        expect(ghast).toMatchObject({
            'minecraft:entity': {
                components: { [GHAST_SHOOT_FIREBALL]: { priority: 2, projectile: 'minecraft:fireball' } }
            }
        });
        expect(declared(shulker, 'minecraft:shulker')).toEqual([SHULKER_ATTACK]);
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
});
