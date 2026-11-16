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

    it('leaves a file no rule names unchanged', () => {
        const data = entityFile('minecraft:creeper', {}, { 'minecraft:freezing_immune': {} });
        expect(withJavaComponentRules(data)).toBe(data);
    });
});
