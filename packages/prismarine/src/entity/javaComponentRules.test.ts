import { describe, expect, it } from 'vitest';

import { withJavaComponentRules } from './javaComponentRules';

const entityFile = (identifier: string, groups: Record<string, unknown>, components: Record<string, unknown> = {}) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components,
        component_groups: groups
    }
});

describe('withJavaComponentRules', () => {
    it("dries an axolotl out by Java's 2 a second", () => {
        const data = withJavaComponentRules(
            entityFile('minecraft:axolotl', {
                axolotl_dried: { 'minecraft:damage_over_time': { damage_per_hurt: 1, time_between_hurt: 0 } }
            })
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    axolotl_dried: { 'minecraft:damage_over_time': { damage_per_hurt: 2, time_between_hurt: 1 } }
                }
            }
        });
    });

    it("blows a TNT minecart up with Java's power 4, keeping its fuse", () => {
        const data = withJavaComponentRules(
            entityFile('minecraft:tnt_minecart', {
                'minecraft:primed_tnt': { 'minecraft:explode': { power: 3, fuse_length: 4, fuse_lit: true } }
            })
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:primed_tnt': { 'minecraft:explode': { power: 4, fuse_length: 4, fuse_lit: true } }
                }
            }
        });
    });

    it("takes the TNT minecart's flint and steel priming out, which Java's minecart has no interact for", () => {
        const interact = { interactions: [{ on_interact: { event: 'minecraft:on_prime' } }] };
        const data = withJavaComponentRules(
            entityFile('minecraft:tnt_minecart', { 'minecraft:inactive': { 'minecraft:interact': interact } })
        );

        expect(data).toEqual(entityFile('minecraft:tnt_minecart', { 'minecraft:inactive': {} }));
    });

    it("keeps a trader llama off its lead wild, where the pack's sensor tames it", () => {
        const persistence = {
            filters: { test: 'is_leashed', value: false },
            event: 'minecraft:remove_persistence'
        };
        const tame = { filters: { test: 'is_leashed', value: false }, event: 'minecraft:on_tame' };
        const data = withJavaComponentRules(
            entityFile('minecraft:trader_llama', {
                'minecraft:llama_wandering_trader': {
                    'minecraft:environment_sensor': { triggers: [tame, persistence] }
                }
            })
        );

        expect(data).toEqual(
            entityFile('minecraft:trader_llama', {
                'minecraft:llama_wandering_trader': { 'minecraft:environment_sensor': { triggers: [persistence] } }
            })
        );
    });

    it("takes the creaking's freezing immunity out, which Java's creaking does not have", () => {
        const data = withJavaComponentRules(
            entityFile('minecraft:creaking', {}, { 'minecraft:freezing_immune': {}, 'minecraft:health': { value: 1 } })
        );

        expect(data).toEqual(entityFile('minecraft:creaking', {}, { 'minecraft:health': { value: 1 } }));
    });

    it("draws an adult polar bear's anger from Java's 20 to 39 seconds and leaves a baby's alone", () => {
        const data = withJavaComponentRules(
            entityFile('minecraft:polar_bear', {
                'minecraft:baby_scared': { 'minecraft:angry': { duration: 1 } },
                'minecraft:adult_hostile': { 'minecraft:angry': { duration: 500 } }
            })
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:baby_scared': { 'minecraft:angry': { duration: 1 } },
                    'minecraft:adult_hostile': { 'minecraft:angry': { duration: 29.5, duration_delta: 9.5 } }
                }
            }
        });
    });

    it('lets a mob hurt a ghast', () => {
        const ghast = withJavaComponentRules(entityFile('minecraft:ghast', {}, { 'minecraft:cannot_be_attacked': {} }));

        expect(ghast).toEqual(entityFile('minecraft:ghast', {}, {}));
    });

    it("lets a big slime hurt only the iron golem it touches, and a full pufferfish deal Java's 3", () => {
        const golems = {
            any_of: [
                { test: 'is_family', subject: 'other', value: 'player' },
                { test: 'is_family', subject: 'other', value: 'irongolem' },
                { test: 'is_family', subject: 'other', value: 'snowgolem' }
            ]
        };
        const slime = withJavaComponentRules(
            entityFile('minecraft:slime', {
                'minecraft:slime_large': { 'minecraft:area_attack': { damage_per_tick: 4, entity_filter: golems } }
            })
        );
        const pufferfish = withJavaComponentRules(
            entityFile('minecraft:pufferfish', {
                'minecraft:full_puff': { 'minecraft:area_attack': { damage_per_tick: 2 } }
            })
        );

        expect(slime).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:slime_large': {
                        'minecraft:area_attack': { entity_filter: { any_of: golems.any_of.slice(0, 2) } }
                    }
                }
            }
        });
        expect(pufferfish).toMatchObject({
            'minecraft:entity': {
                component_groups: { 'minecraft:full_puff': { 'minecraft:area_attack': { damage_per_tick: 3 } } }
            }
        });
    });

    it('picks a skeleton or pillager weapon goal by the weapon alone, never by the water', () => {
        const underwater = { event: 'minecraft:melee_mode', filters: { test: 'is_underwater' } };
        const unarmed = { event: 'minecraft:melee_mode', filters: { test: 'has_ranged_weapon', value: false } };
        const bogged = withJavaComponentRules(
            entityFile('minecraft:bogged', {
                'minecraft:ranged_attack': { 'minecraft:environment_sensor': { triggers: [underwater, unarmed] } },
                'minecraft:melee_attack': {
                    'minecraft:environment_sensor': {
                        triggers: [
                            {
                                event: 'minecraft:ranged_mode',
                                filters: { all_of: [{ test: 'in_water', value: false }, { test: 'has_ranged_weapon' }] }
                            }
                        ]
                    }
                }
            })
        );
        const pillager = withJavaComponentRules(
            entityFile('minecraft:pillager', {
                'minecraft:ranged_attack': { 'minecraft:environment_sensor': { triggers: underwater } },
                'minecraft:melee_attack': {
                    'minecraft:environment_sensor': {
                        triggers: { event: 'minecraft:ranged_mode', filters: { test: 'in_water', value: false } }
                    }
                }
            })
        );

        expect(bogged).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:ranged_attack': { 'minecraft:environment_sensor': { triggers: [unarmed] } },
                    'minecraft:melee_attack': {
                        'minecraft:environment_sensor': {
                            triggers: [
                                { event: 'minecraft:ranged_mode', filters: { all_of: [{ test: 'has_ranged_weapon' }] } }
                            ]
                        }
                    }
                }
            }
        });
        expect(pillager).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:ranged_attack': { 'minecraft:environment_sensor': { triggers: [] } },
                    'minecraft:melee_attack': {
                        'minecraft:environment_sensor': { triggers: [{ event: 'minecraft:ranged_mode' }] }
                    }
                }
            }
        });
    });

    it("drops a boat's sinking-column timer, so Java's 60-tick count drags it under and it keeps its seats", () => {
        const timer = { looping: false, time: 3, time_down_event: { event: 'minecraft:sink', target: 'self' } };
        for (const identifier of ['minecraft:boat', 'minecraft:chest_boat']) {
            const data = withJavaComponentRules(
                entityFile(identifier, {
                    'minecraft:above_bubble_column_down': { 'minecraft:out_of_control': {}, 'minecraft:timer': timer },
                    'minecraft:other': { 'minecraft:timer': timer }
                })
            );

            expect(data).toEqual(
                entityFile(identifier, {
                    'minecraft:above_bubble_column_down': { 'minecraft:out_of_control': {} },
                    'minecraft:other': { 'minecraft:timer': timer }
                })
            );
        }
    });

    it('leaves a file no rule names unchanged', () => {
        const data = entityFile('minecraft:creeper', {}, { 'minecraft:freezing_immune': {} });
        expect(withJavaComponentRules(data)).toBe(data);
    });

    it('makes a nautilus heal from its food before it breeds, as Java feeds a hurt one first', () => {
        const data = withJavaComponentRules(
            entityFile('minecraft:nautilus', {
                'minecraft:nautilus_adult': { 'minecraft:breedable': { breed_items: ['fish'] } }
            })
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    'minecraft:nautilus_adult': {
                        'minecraft:breedable': { breed_items: ['fish'], require_full_health: true }
                    }
                }
            }
        });
    });

    it("kills a parrot fed a cookie and poisons it for Java's 900 ticks", () => {
        const data = withJavaComponentRules(
            entityFile(
                'minecraft:parrot',
                {},
                {
                    'minecraft:healable': {
                        force_use: true,
                        items: [
                            { item: 'cookie', heal_amount: 0, effects: [{ name: 'fatal_poison', duration: 1000 }] },
                            { item: 'wheat_seeds', heal_amount: 1 }
                        ]
                    }
                }
            )
        );

        expect(data).toMatchObject({
            'minecraft:entity': {
                components: {
                    'minecraft:healable': {
                        force_use: true,
                        items: [
                            {
                                item: 'cookie',
                                heal_amount: -3.4028234663852886e38,
                                effects: [{ name: 'poison', duration: 45, amplifier: 0, chance: 1 }]
                            },
                            { item: 'wheat_seeds', heal_amount: 1 }
                        ]
                    }
                }
            }
        });
    });
});
