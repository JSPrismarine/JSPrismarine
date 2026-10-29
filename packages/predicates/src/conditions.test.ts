import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';
import { LOOT_CONDITION_TYPES, parsePredicate } from './conditions';
import { PredicateContext } from './context';
import type { PredicateContextOptions } from './context';
import type { ParseOptions } from './parse';
import { scriptedRandom } from './random';
import type { ItemStack } from './item';

const stackWith = (id: string, enchantment: string, level: number): ItemStack => ({
    id,
    count: 1,
    components: new Map([['minecraft:enchantments', { levels: { [enchantment]: level } }]])
});

const check = (json: unknown, options: PredicateContextOptions = {}, parseOptions?: ParseOptions): boolean => {
    const { value, diagnostics } = parsePredicate(json, parseOptions);
    expect(diagnostics).toEqual([]);
    return value(new PredicateContext(options));
};

describe('LOOT_CONDITION_TYPES', () => {
    it('reports the available loot conditions', () => {
        reportProgress(`Loot condition parser exposes ${LOOT_CONDITION_TYPES.length} types.`);
    });
});

describe('composite conditions', () => {
    const yes = { type: 'minecraft:killed_by_player' };
    const no = { type: 'minecraft:inverted', term: yes };
    const killed: PredicateContextOptions = {
        parameterSet: 'entity',
        parameters: { last_damage_player: { type: 'minecraft:player' } }
    };

    it('inverts a term', () => {
        expect(check(no, killed)).toBe(false);
    });

    it('requires every term of all_of', () => {
        expect(check({ type: 'minecraft:all_of', terms: [yes, yes] }, killed)).toBe(true);
        expect(check({ type: 'minecraft:all_of', terms: [yes, no] }, killed)).toBe(false);
    });

    it('requires one term of any_of', () => {
        expect(check({ type: 'minecraft:any_of', terms: [no, yes] }, killed)).toBe(true);
        expect(check({ type: 'minecraft:any_of', terms: [no, no] }, killed)).toBe(false);
    });

    it('reads a list of conditions as an and', () => {
        expect(check([yes, no], killed)).toBe(false);
        expect(check([yes, yes], killed)).toBe(true);
    });
});

describe('chance conditions', () => {
    it('compares random_chance against the injected random', () => {
        const condition = { type: 'minecraft:random_chance', chance: 0.3 };

        expect(check(condition, { random: scriptedRandom([0.2]) })).toBe(true);
        expect(check(condition, { random: scriptedRandom([0.4]) })).toBe(false);
    });

    it('uses the enchanted chance when the attacker holds the enchantment', () => {
        const condition = {
            type: 'minecraft:random_chance_with_enchanted_bonus',
            unenchanted_chance: 0,
            enchanted_chance: { type: 'minecraft:linear', base: 0.5, per_level_above_first: 0.25 },
            enchantment: 'minecraft:looting'
        };
        const attacker = {
            type: 'minecraft:player',
            equipment: { mainhand: stackWith('minecraft:sword', 'minecraft:looting', 3) }
        };

        expect(
            check(condition, {
                parameterSet: 'entity',
                parameters: { attacking_entity: attacker },
                random: scriptedRandom([0.9])
            })
        ).toBe(true);
        expect(check(condition, { parameterSet: 'entity', random: scriptedRandom([0.0001]) })).toBe(false);
    });

    it('scales table_bonus by the tool enchantment level', () => {
        const condition = {
            type: 'minecraft:table_bonus',
            enchantment: 'minecraft:fortune',
            chances: [0, 0.25, 0.5, 1]
        };

        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { tool: stackWith('minecraft:pickaxe', 'minecraft:fortune', 3) },
                random: scriptedRandom([0.99])
            })
        ).toBe(true);
        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { tool: stackWith('minecraft:pickaxe', 'minecraft:fortune', 1) },
                random: scriptedRandom([0.3])
            })
        ).toBe(false);
    });

    it('survives an explosion more often the smaller the radius', () => {
        const condition = { type: 'minecraft:survives_explosion' };

        expect(check(condition, { parameterSet: 'block', random: scriptedRandom([0.99]) })).toBe(true);
        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { explosion_radius: 4 },
                random: scriptedRandom([0.2])
            })
        ).toBe(true);
        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { explosion_radius: 4 },
                random: scriptedRandom([0.3])
            })
        ).toBe(false);
    });
});

describe('context conditions', () => {
    it('reports killed_by_player from the last damage player', () => {
        expect(check({ type: 'minecraft:killed_by_player' }, { parameterSet: 'entity' })).toBe(false);
        expect(
            check(
                { type: 'minecraft:killed_by_player' },
                { parameterSet: 'entity', parameters: { last_damage_player: { type: 'minecraft:player' } } }
            )
        ).toBe(true);
    });

    it('matches entity_properties against the named target', () => {
        const condition = {
            type: 'minecraft:entity_properties',
            entity: 'this',
            predicate: { 'minecraft:entity_type': 'minecraft:sheep' }
        };

        expect(
            check(condition, { parameterSet: 'entity', parameters: { this_entity: { type: 'minecraft:sheep' } } })
        ).toBe(true);
        expect(
            check(condition, { parameterSet: 'entity', parameters: { this_entity: { type: 'minecraft:cow' } } })
        ).toBe(false);
    });

    it('reads entity_scores from the entity view', () => {
        const condition = {
            type: 'minecraft:entity_scores',
            entity: 'this',
            scores: { kills: { min: 5 } }
        };
        const entity = { type: 'minecraft:player', scores: new Map([['kills', 7]]) };

        expect(check(condition, { parameterSet: 'entity', parameters: { this_entity: entity } })).toBe(true);
    });

    it('matches match_block against the block state parameter', () => {
        const condition = {
            type: 'minecraft:match_block',
            blocks: ['minecraft:smoker', 'minecraft:blast_furnace'],
            state: { lit: 'true' }
        };

        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { block_state: { name: 'minecraft:smoker', properties: { lit: 'true' } } }
            })
        ).toBe(true);
        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { block_state: { name: 'minecraft:smoker', properties: { lit: 'false' } } }
            })
        ).toBe(false);
    });

    it('matches match_tool against the tool parameter', () => {
        const condition = { type: 'minecraft:match_tool', predicate: { items: 'minecraft:shears' } };

        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { tool: { id: 'minecraft:shears', count: 1, components: new Map() } }
            })
        ).toBe(true);
        expect(
            check(condition, {
                parameterSet: 'block',
                parameters: { tool: { id: 'minecraft:stick', count: 1, components: new Map() } }
            })
        ).toBe(false);
    });

    it('matches damage_source_properties against the damage source', () => {
        const condition = {
            type: 'minecraft:damage_source_properties',
            predicate: { tags: [{ id: 'minecraft:is_fire', expected: true }] }
        };

        expect(
            check(condition, {
                parameterSet: 'entity',
                parameters: { damage_source: { type: 'minecraft:in_fire', tags: ['minecraft:is_fire'] } }
            })
        ).toBe(true);
        expect(
            check(condition, {
                parameterSet: 'entity',
                parameters: { damage_source: { type: 'minecraft:arrow', tags: [] } }
            })
        ).toBe(false);
    });

    it('reads enchantment_active_check from the context parameter', () => {
        const condition = { type: 'minecraft:enchantment_active_check', active: true };

        expect(check(condition, { parameterSet: 'enchanted_location', parameters: { enchantment_active: true } })).toBe(
            true
        );
        expect(
            check(condition, { parameterSet: 'enchanted_location', parameters: { enchantment_active: false } })
        ).toBe(false);
    });
});

describe('level conditions', () => {
    it('checks the location at the origin plus the offsets', () => {
        const condition = {
            type: 'minecraft:location_check',
            offsetY: -1,
            predicate: { block: { blocks: 'minecraft:water' } }
        };
        const level = {
            blockAt: (position: { y: number }) => ({ name: position.y === 63 ? 'minecraft:water' : 'minecraft:stone' })
        };

        expect(check(condition, { parameterSet: 'chest', parameters: { origin: { x: 0, y: 64, z: 0 } }, level })).toBe(
            true
        );
        expect(check(condition, { parameterSet: 'chest', parameters: { origin: { x: 0, y: 70, z: 0 } }, level })).toBe(
            false
        );
    });

    it('checks the weather', () => {
        const condition = { type: 'minecraft:weather_check', raining: true, thundering: false };

        expect(check(condition, { level: { isRaining: () => true, isThundering: () => false } })).toBe(true);
        expect(check(condition, { level: { isRaining: () => true, isThundering: () => true } })).toBe(false);
    });

    it('checks the clock within a period', () => {
        const condition = { type: 'minecraft:time_check', period: 24000, value: { min: 12000, max: 23999 } };

        expect(check(condition, { level: { clockTicks: () => 37000 } })).toBe(true);
        expect(check(condition, { level: { clockTicks: () => 25000 } })).toBe(false);
    });

    it('checks an environment attribute', () => {
        const condition = {
            type: 'minecraft:environment_attribute_check',
            attribute: 'minecraft:temperature',
            value: { min: 0.5 }
        };

        expect(check(condition, { level: { environmentAttribute: () => 0.8 } })).toBe(true);
        expect(check(condition, { level: { environmentAttribute: () => 0.1 } })).toBe(false);
    });
});

describe('value checks', () => {
    it('compares an int provider against an int range', () => {
        const condition = { type: 'minecraft:int_value_check', value: 5, range: { min: 1, max: 10 } };

        expect(check(condition)).toBe(true);
        expect(check({ ...condition, value: 11 })).toBe(false);
    });

    it('compares a float provider against an exact float', () => {
        expect(check({ type: 'minecraft:float_value_check', value: 2.5, range: 2.5 })).toBe(true);
        expect(check({ type: 'minecraft:float_value_check', value: 2.5, range: 2.6 })).toBe(false);
    });
});

describe('diagnostics', () => {
    it('reports an unknown condition type at parse time', () => {
        const { diagnostics } = parsePredicate({ type: 'minecraft:block_state_property' });

        expect(diagnostics).toEqual([
            { severity: 'error', path: '', message: 'unknown loot condition type minecraft:block_state_property' }
        ]);
    });

    it('reports a parameter the declared context set does not provide', () => {
        const { value } = parsePredicate({ type: 'minecraft:match_block', blocks: 'minecraft:stone' });
        const context = new PredicateContext({ parameterSet: 'chest' });

        expect(value(context)).toBe(false);
        expect(context.diagnostics.errors).toEqual([
            { severity: 'error', path: '', message: 'the chest loot context does not provide block_state' },
            { severity: 'error', path: '', message: 'the chest loot context does not provide block_entity' }
        ]);
    });

    it('reports a required parameter the host did not supply', () => {
        const { value } = parsePredicate({ type: 'minecraft:match_tool', predicate: { items: 'minecraft:shears' } });
        const context = new PredicateContext({ parameterSet: 'block' });

        expect(value(context)).toBe(false);
        expect(context.diagnostics.errors).toEqual([
            { severity: 'error', path: '', message: 'required loot context parameter tool is missing' }
        ]);
    });

    it('resolves a predicate reference the way vanilla block loot does', () => {
        const resolver = {
            element: () => ({ type: 'minecraft:match_tool', predicate: { items: 'minecraft:shears' } })
        };
        const options = {
            parameterSet: 'block',
            parameters: { tool: { id: 'minecraft:shears', count: 1, components: new Map() } }
        } satisfies PredicateContextOptions;

        expect(check('minecraft:tool/can_shear', options, { resolver })).toBe(true);
    });
});
