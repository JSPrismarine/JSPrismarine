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

    it("lets a mob hurt a ghast and turns a skeleton in powder snow after Java's 22 seconds", () => {
        const ghast = withJavaComponentRules(entityFile('minecraft:ghast', {}, { 'minecraft:cannot_be_attacked': {} }));
        const skeleton = withJavaComponentRules(
            entityFile('minecraft:skeleton', { in_powder_snow: { 'minecraft:timer': { time: 20 } } })
        );

        expect(ghast).toEqual(entityFile('minecraft:ghast', {}, {}));
        expect(skeleton).toMatchObject({
            'minecraft:entity': { component_groups: { in_powder_snow: { 'minecraft:timer': { time: 22 } } } }
        });
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

    it('leaves a file no rule names unchanged', () => {
        const data = entityFile('minecraft:creeper', {}, { 'minecraft:freezing_immune': {} });
        expect(withJavaComponentRules(data)).toBe(data);
    });
});
