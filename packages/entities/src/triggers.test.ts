import { describe, expect, it } from 'vitest';

import type { EntityEnvironment, EntityInstance } from './entityInstance';
import { EntityTypes } from './entityTypes';
import type { FilterEntityView } from './filterContext';

/**
 * The damage pipeline and the eleven `minecraft:on_*` components, asserted by
 * the health the entity is left with and the component groups the triggered
 * events add.
 */

const guard = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:guard', is_spawnable: true },
        components: {
            'minecraft:health': { value: 20, max: 20 },
            'minecraft:type_family': { family: ['guard', 'mob'] },
            'minecraft:on_hurt': { event: 'test:wince', target: 'self' },
            'minecraft:on_hurt_by_player': { event: 'test:anger', target: 'self' },
            'minecraft:on_death': { event: 'test:collapse', target: 'self' },
            'minecraft:on_target_acquired': { event: 'test:anger', target: 'self' },
            'minecraft:on_target_escape': { event: 'test:calm', target: 'self' },
            'minecraft:on_ignite': { event: 'test:wince', target: 'other' }
        },
        component_groups: {
            'test:wincing': { 'minecraft:is_shaking': {} },
            'test:angry': { 'minecraft:angry': { duration: 25 } },
            'test:collapsed': { 'minecraft:instant_despawn': {} }
        },
        events: {
            'test:wince': { add: { component_groups: ['test:wincing'] } },
            'test:anger': { add: { component_groups: ['test:angry'] } },
            'test:calm': { remove: { component_groups: ['test:angry'] } },
            'test:collapse': { add: { component_groups: ['test:collapsed'] } }
        }
    }
};

/** A guard whose hurt trigger only fires while it is below half health. */
const picky = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:picky' },
        components: {
            'minecraft:health': { value: 20, max: 20 },
            'minecraft:on_hurt': {
                event: 'test:wince',
                target: 'self',
                filters: { test: 'is_family', subject: 'other', value: 'player' }
            }
        },
        component_groups: { 'test:wincing': { 'minecraft:is_shaking': {} } },
        events: { 'test:wince': { add: { component_groups: ['test:wincing'] } } }
    }
};

const burner = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:burner' },
        components: {
            'minecraft:health': { value: 20, max: 20 },
            'minecraft:fire_immune': {},
            'minecraft:damage_sensor': { triggers: [{ cause: 'lava', on_damage: { event: 'test:hiss' } }] }
        },
        component_groups: { 'test:hissing': { 'minecraft:is_shaking': {} } },
        events: { 'test:hiss': { add: { component_groups: ['test:hissing'] } } }
    }
};

const spawn = (data: unknown, identifier: string, environment: EntityEnvironment = {}): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn(identifier, { environment });
};

const player: FilterEntityView = { id: () => 'steve', names: (name) => (name === 'is_family' ? ['player'] : []) };
const wolf: FilterEntityView = { id: () => 'wolf', names: (name) => (name === 'is_family' ? ['wolf'] : []) };

describe('the damage pipeline', () => {
    it('takes the damage off the health attribute', () => {
        const entity = spawn(guard, 'test:guard');

        expect(entity.damage({ cause: 'fall', amount: 7 })).toMatchObject({ amount: 7, health: 13, died: false });
        expect(entity.attributes.value('health')).toBe(13);
    });

    it('fires the hurt trigger, which lands on the next tick', () => {
        const entity = spawn(guard, 'test:guard');

        expect(entity.damage({ cause: 'fall', amount: 1 }).events).toEqual(['test:wince']);
        expect(entity.hasComponent('minecraft:is_shaking')).toBe(false);

        entity.tick();

        expect(entity.hasComponent('minecraft:is_shaking')).toBe(true);
    });

    it('fires the player trigger only when the damager is of the player family', () => {
        const byWolf = spawn(guard, 'test:guard');
        const byPlayer = spawn(guard, 'test:guard');

        expect(byWolf.damage({ cause: 'entity_attack', amount: 1, damager: wolf }).events).toEqual(['test:wince']);
        expect(byPlayer.damage({ cause: 'entity_attack', amount: 1, damager: player }).events).toEqual([
            'test:wince',
            'test:anger'
        ]);
    });

    it('fires the death trigger when the damage empties the health attribute', () => {
        const entity = spawn(guard, 'test:guard');
        const result = entity.damage({ cause: 'entity_attack', amount: 40 });

        expect(result).toMatchObject({ amount: 40, health: 0, died: true });
        expect(result.events).toEqual(['test:wince', 'test:collapse']);
    });

    it('fires nothing more once the entity is already at zero health', () => {
        const entity = spawn(guard, 'test:guard');
        entity.damage({ cause: 'entity_attack', amount: 40 });

        expect(entity.damage({ cause: 'entity_attack', amount: 0 })).toMatchObject({ died: false, events: [] });
    });

    it('gates a trigger on its own filters, with the damager as the other subject', () => {
        const entity = spawn(picky, 'test:picky');

        expect(entity.damage({ cause: 'entity_attack', amount: 1, damager: wolf }).events).toEqual([]);
        expect(entity.damage({ cause: 'entity_attack', amount: 1, damager: player }).events).toEqual(['test:wince']);
    });

    it('lets a damage sensor fire its event on damage an immunity then turns aside', () => {
        const entity = spawn(burner, 'test:burner');
        const result = entity.damage({ cause: 'lava', amount: 4 });

        expect(result).toMatchObject({ amount: 0, health: 20 });
        expect(result.events).toEqual(['test:hiss']);

        entity.tick();

        expect(entity.hasComponent('minecraft:is_shaking')).toBe(true);
    });
});

describe('the target triggers', () => {
    it('fires on_target_acquired when the entity takes a target', () => {
        const entity = spawn(guard, 'test:guard');
        entity.setAttackTarget(wolf);
        entity.tick();

        expect(entity.hasComponent('minecraft:angry')).toBe(true);
    });

    it('fires nothing when a goal reasserts the target it already has', () => {
        const entity = spawn(guard, 'test:guard');
        entity.setAttackTarget(wolf);
        entity.tick();
        entity.setAttackTarget(wolf);

        expect(entity.queued()).toEqual([]);
    });

    it('fires on_target_escape when the target is cleared', () => {
        const entity = spawn(guard, 'test:guard');
        entity.setAttackTarget(wolf);
        entity.tick();
        entity.setAttackTarget(undefined);
        entity.tick();

        expect(entity.hasComponent('minecraft:angry')).toBe(false);
    });
});

describe('EntityInstance.trigger', () => {
    it('routes a trigger aimed at another entity', () => {
        const routed: string[] = [];
        const entity = spawn(guard, 'test:guard', {
            route: (trigger) => routed.push(`${trigger.target} ${trigger.event}`)
        });

        expect(entity.trigger('minecraft:on_ignite')).toBe('test:wince');
        expect(routed).toEqual(['other test:wince']);
    });

    it('reports a trigger aimed at another entity when nothing routes it', () => {
        const reported: string[] = [];
        const entity = spawn(guard, 'test:guard', { report: (message) => reported.push(message) });

        expect(entity.trigger('minecraft:on_ignite')).toBeUndefined();
        expect(reported).toEqual(['minecraft:on_ignite fires test:wince on other, which nothing routes']);
    });

    it('does nothing when the component is not active', () => {
        const entity = spawn(guard, 'test:guard');

        expect(entity.trigger('minecraft:on_wake_with_owner')).toBeUndefined();
        expect(entity.queued()).toEqual([]);
    });
});
