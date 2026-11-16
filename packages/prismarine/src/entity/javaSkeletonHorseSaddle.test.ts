import { EntityTypes } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { withJavaSkeletonHorseSaddle } from './javaSkeletonHorseSaddle';

/** The part of the pack's skeleton horse file the overlay reads. */
const SKELETON_HORSE = {
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier: 'minecraft:skeleton_horse', is_spawnable: true, is_summonable: true },
        components: {
            'minecraft:health': { value: 15, max: 15 },
            'minecraft:is_tamed': {},
            'minecraft:input_ground_controlled': {},
            'minecraft:can_power_jump': {}
        },
        component_groups: { 'minecraft:skeleton_horse_adult': { 'minecraft:leashable_to': {} } },
        events: { 'minecraft:entity_spawned': { add: { component_groups: ['minecraft:skeleton_horse_adult'] } } }
    }
};

const spawned = () => {
    const types = new EntityTypes();
    types.load([
        { data: withJavaSkeletonHorseSaddle(SKELETON_HORSE), pack: 'test', path: 'entities/skeleton_horse.json' }
    ]);
    return types.spawn('minecraft:skeleton_horse');
};

describe('withJavaSkeletonHorseSaddle', () => {
    it('hands the rider the controls only once the horse is saddled', () => {
        const horse = spawned();
        expect(horse.hasComponent('minecraft:input_ground_controlled')).toBe(false);
        expect(horse.hasComponent('minecraft:can_power_jump')).toBe(false);
        expect(horse.hasComponent('minecraft:equippable')).toBe(true);
        // The saddle goes into slot 0 of a container, which the pack's skeleton horse has none of.
        expect(horse.componentParams('minecraft:inventory')).toMatchObject({ inventorySize: 1 });

        horse.fire('minecraft:horse_saddled');
        horse.applyQueuedEvents();
        expect(horse.hasComponent('minecraft:is_saddled')).toBe(true);
        expect(horse.hasComponent('minecraft:input_ground_controlled')).toBe(true);
        expect(horse.hasComponent('minecraft:can_power_jump')).toBe(true);

        horse.fire('minecraft:horse_unsaddled');
        horse.applyQueuedEvents();
        expect(horse.hasComponent('minecraft:input_ground_controlled')).toBe(false);
    });

    it('leaves every other file as it is', () => {
        const other = { 'minecraft:entity': { description: { identifier: 'minecraft:horse' } } };
        expect(withJavaSkeletonHorseSaddle(other)).toBe(other);
    });
});
