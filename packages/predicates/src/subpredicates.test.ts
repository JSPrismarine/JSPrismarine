import { describe, expect, it } from 'vitest';

import { PredicateContext } from './context';
import type { PredicateContextOptions } from './context';
import { DiagnosticCollector } from './diagnostics';
import { asString, member } from './json';
import type { ItemStack } from './item';
import { ParseContext } from './parse';
import type { GrammarExtensions } from './parse';
import {
    blockPredicate,
    entityPredicate,
    ENTITY_SUB_PREDICATES,
    DATA_COMPONENT_PREDICATES,
    itemPredicate,
    locationPredicate,
    statePropertiesTest
} from './subpredicates';
import type { EntityView } from './world';

const parse = <T>(
    build: (value: unknown, context: ParseContext) => T,
    json: unknown,
    extensions: GrammarExtensions = {}
): { readonly matcher: T; readonly collector: DiagnosticCollector } => {
    const collector = new DiagnosticCollector();
    return { matcher: build(json, new ParseContext('root', collector, undefined, extensions)), collector };
};

const stack = (id: string, components: Iterable<readonly [string, unknown]> = []): ItemStack => ({
    id,
    count: 1,
    components: new Map(components)
});

const evaluation = (options: PredicateContextOptions = {}): PredicateContext => new PredicateContext(options);

describe('the registries 26.3 declares', () => {
    it('covers the 25 entity sub-predicate types', () => {
        expect(ENTITY_SUB_PREDICATES).toHaveLength(25);
    });

    it('covers the 15 data component predicate types', () => {
        expect(DATA_COMPONENT_PREDICATES).toHaveLength(15);
    });
});

describe('state properties', () => {
    it('matches an exact value', () => {
        const { matcher } = parse(statePropertiesTest, { level: '0' });

        expect(matcher({ level: '0' })).toBe(true);
        expect(matcher({ level: '1' })).toBe(false);
    });

    it('compares a min and max numerically', () => {
        const { matcher } = parse(statePropertiesTest, { age: { min: '2', max: '7' } });

        expect(matcher({ age: '10' })).toBe(false);
        expect(matcher({ age: '3' })).toBe(true);
    });
});

describe('item predicates', () => {
    it('matches the item identifier', () => {
        const { matcher } = parse(itemPredicate, { items: 'minecraft:shears' });

        expect(matcher(stack('minecraft:shears'), evaluation())).toBe(true);
        expect(matcher(stack('minecraft:stick'), evaluation())).toBe(false);
        expect(matcher(undefined, evaluation())).toBe(false);
    });

    it('matches the silk touch check vanilla block loot references', () => {
        const { matcher, collector } = parse(itemPredicate, {
            predicates: {
                'minecraft:enchantments': [{ enchantments: 'minecraft:silk_touch', levels: { min: 1 } }]
            }
        });

        expect(collector.entries).toEqual([]);
        expect(
            matcher(
                stack('minecraft:pickaxe', [['minecraft:enchantments', { levels: { 'minecraft:silk_touch': 1 } }]]),
                evaluation()
            )
        ).toBe(true);
        expect(matcher(stack('minecraft:pickaxe'), evaluation())).toBe(false);
    });

    it('warns and fails for a data component predicate it does not implement', () => {
        const { matcher, collector } = parse(itemPredicate, { predicates: { 'minecraft:container': {} } });

        expect(matcher(stack('minecraft:chest'), evaluation())).toBe(false);
        expect(collector.entries).toEqual([
            {
                severity: 'warning',
                path: 'root.predicates.minecraft:container',
                message: 'data component predicate minecraft:container is not implemented; it evaluates false'
            }
        ]);
    });

    it('checks only presence for a key that names a component rather than a predicate type', () => {
        const { matcher, collector } = parse(itemPredicate, { predicates: { 'minecraft:map_id': {} } });

        expect(collector.entries).toEqual([]);
        expect(matcher(stack('minecraft:filled_map', [['minecraft:map_id', 3]]), evaluation())).toBe(true);
        expect(matcher(stack('minecraft:map'), evaluation())).toBe(false);
    });

    it('warns that the body of a presence check is ignored', () => {
        const { collector } = parse(itemPredicate, { predicates: { 'minecraft:map_id': { value: 3 } } });

        expect(collector.entries).toEqual([
            {
                severity: 'warning',
                path: 'root.predicates.minecraft:map_id',
                message:
                    'minecraft:map_id is not a data component predicate type, so only the presence of the component is checked'
            }
        ]);
    });
});

describe('block predicates', () => {
    it('matches a block list and its state', () => {
        const { matcher } = parse(blockPredicate, { blocks: ['minecraft:smoker'], state: { lit: 'true' } });

        expect(matcher({ name: 'minecraft:smoker', properties: { lit: 'true' } }, undefined, evaluation())).toBe(true);
        expect(matcher({ name: 'minecraft:furnace', properties: { lit: 'true' } }, undefined, evaluation())).toBe(
            false
        );
    });
});

describe('location predicates', () => {
    it('matches the biome through the level view', () => {
        const { matcher } = parse(locationPredicate, { biomes: 'minecraft:meadow' });
        const level = { biomeAt: () => 'minecraft:meadow' };

        expect(matcher({ x: 0, y: 0, z: 0 }, evaluation({ level }))).toBe(true);
        expect(matcher({ x: 0, y: 0, z: 0 }, evaluation({ level: { biomeAt: () => 'minecraft:plains' } }))).toBe(false);
    });

    it('reports a level view that cannot answer the question', () => {
        const { matcher } = parse(locationPredicate, { smokey: true });
        const context = evaluation({ level: {} });

        expect(matcher({ x: 0, y: 0, z: 0 }, context)).toBe(false);
        expect(context.diagnostics.errors).toEqual([
            { severity: 'error', path: 'root', message: 'the level view does not implement isSmokey' }
        ]);
    });
});

describe('entity predicates', () => {
    const sheep: EntityView = {
        type: 'minecraft:sheep',
        components: new Map([['minecraft:sheep/color', 'white']]),
        typeSpecific: { sheared: false },
        flags: { is_baby: false, is_on_fire: false },
        position: { x: 1, y: 0, z: 0 }
    };

    it('matches the shearing check vanilla sheep loot uses', () => {
        const { matcher, collector } = parse(entityPredicate, {
            'minecraft:components': { 'minecraft:sheep/color': 'white' },
            'minecraft:type_specific/sheep': { sheared: false }
        });

        expect(collector.entries).toEqual([]);
        expect(matcher(sheep, evaluation())).toBe(true);
        expect(matcher({ ...sheep, typeSpecific: { sheared: true } }, evaluation())).toBe(false);
    });

    it('matches an entity type', () => {
        const { matcher } = parse(entityPredicate, { 'minecraft:entity_type': 'minecraft:sheep' });

        expect(matcher(sheep, evaluation())).toBe(true);
        expect(matcher({ type: 'minecraft:cow' }, evaluation())).toBe(false);
    });

    it('matches an entity type tag the entity carries', () => {
        const { matcher } = parse(entityPredicate, { 'minecraft:entity_type': '#minecraft:skeletons' });

        expect(matcher({ type: 'minecraft:bogged', typeTags: ['minecraft:skeletons'] }, evaluation())).toBe(true);
        expect(matcher({ type: 'minecraft:cow', typeTags: [] }, evaluation())).toBe(false);
    });

    it('matches flags and reports a flag the entity view does not report', () => {
        const { matcher } = parse(entityPredicate, { 'minecraft:flags': { is_on_fire: true } });

        expect(matcher({ ...sheep, flags: { is_on_fire: true } }, evaluation())).toBe(true);

        const context = evaluation();
        expect(matcher({ type: 'minecraft:sheep' }, context)).toBe(false);
        expect(context.diagnostics.errors).toEqual([
            {
                severity: 'error',
                path: 'root.minecraft:flags',
                message: 'the entity view does not report the is_on_fire flag'
            }
        ]);
    });

    it('measures the distance from the origin', () => {
        const { matcher } = parse(entityPredicate, { 'minecraft:distance': { horizontal: { max: 2 } } });
        const context = evaluation({ parameterSet: 'entity', parameters: { origin: { x: 0, y: 0, z: 0 } } });

        expect(matcher(sheep, context)).toBe(true);
        expect(matcher({ ...sheep, position: { x: 9, y: 0, z: 0 } }, context)).toBe(false);
    });

    it('descends into a vehicle', () => {
        const { matcher } = parse(entityPredicate, {
            'minecraft:vehicle': { 'minecraft:entity_type': 'minecraft:boat' }
        });

        expect(matcher({ ...sheep, vehicle: { type: 'minecraft:boat' } }, evaluation())).toBe(true);
        expect(matcher(sheep, evaluation())).toBe(false);
    });

    it('matches the hunger check vanilla lunge uses', () => {
        const { matcher, collector } = parse(entityPredicate, {
            'minecraft:type_specific/player': { food: { level: { min: 7 } } }
        });
        const player = { type: 'minecraft:player', food: { level: 7, saturation: 0 } };

        expect(collector.entries).toEqual([]);
        expect(matcher(player, evaluation())).toBe(true);
        expect(matcher({ ...player, food: { level: 6, saturation: 0 } }, evaluation())).toBe(false);
    });

    it('matches food saturation and reports a view with no hunger state', () => {
        const { matcher } = parse(entityPredicate, {
            'minecraft:type_specific/player': { food: { saturation: { max: 2.5 } } }
        });

        expect(matcher({ type: 'minecraft:player', food: { level: 20, saturation: 2.5 } }, evaluation())).toBe(true);
        expect(matcher({ type: 'minecraft:player', food: { level: 20, saturation: 5 } }, evaluation())).toBe(false);

        const context = evaluation();
        expect(matcher({ type: 'minecraft:player' }, context)).toBe(false);
        expect(context.diagnostics.errors).toEqual([
            {
                severity: 'error',
                path: 'root.minecraft:type_specific/player.food',
                message: 'the entity view does not report the food level'
            }
        ]);
    });

    it('warns and fails for a sub-predicate it does not implement', () => {
        const { matcher, collector } = parse(entityPredicate, { 'minecraft:nbt': '{}' });

        expect(matcher(sheep, evaluation())).toBe(false);
        expect(collector.entries).toEqual([
            {
                severity: 'warning',
                path: 'root.minecraft:nbt',
                message: 'entity sub-predicate minecraft:nbt is not implemented; it evaluates false'
            }
        ]);
    });

    it('reports a sub-predicate type that is not in the registry', () => {
        const { collector } = parse(entityPredicate, { 'minecraft:type_specific/axolotl': {} });

        expect(collector.errors).toEqual([
            {
                severity: 'error',
                path: 'root.minecraft:type_specific/axolotl',
                message: 'unknown entity sub-predicate type minecraft:type_specific/axolotl'
            }
        ]);
    });

    it('uses a sub-predicate a host registered through the seam', () => {
        const { matcher, collector } = parse(
            entityPredicate,
            { 'minecraft:type_specific/axolotl': { variant: 'lucy' } },
            {
                entitySubPredicates: {
                    'minecraft:type_specific/axolotl': (value) => (entity) =>
                        entity.typeSpecific?.['variant'] === asString(member(value, 'variant'))
                }
            }
        );

        expect(collector.entries).toEqual([]);
        expect(matcher({ type: 'minecraft:axolotl', typeSpecific: { variant: 'lucy' } }, evaluation())).toBe(true);
        expect(matcher({ type: 'minecraft:axolotl', typeSpecific: { variant: 'blue' } }, evaluation())).toBe(false);
    });
});
