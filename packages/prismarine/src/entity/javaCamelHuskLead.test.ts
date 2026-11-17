import { EntityTypes } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { withJavaCamelHuskLead } from './javaCamelHuskLead';

/** The part of the pack's camel husk file the overlay reads. */
const CAMEL_HUSK = {
    format_version: '1.21.0',
    'minecraft:entity': {
        description: {
            identifier: 'minecraft:camel_husk',
            is_spawnable: true,
            is_summonable: true,
            properties: { 'minecraft:has_rider_mounted': { type: 'bool', default: false } }
        },
        components: {
            'minecraft:health': { value: 32, max: 32 },
            'minecraft:environment_sensor': {
                triggers: [{ event: 'minecraft:rider_mounted', filters: { test: 'rider_count', value: 1 } }]
            }
        },
        component_groups: {
            'minecraft:camel_husk_with_no_hostile_rider': { 'minecraft:leashable': {} }
        },
        events: {
            'minecraft:entity_spawned': { add: { component_groups: ['minecraft:camel_husk_with_no_hostile_rider'] } }
        }
    }
};

describe('withJavaCamelHuskLead', () => {
    it('adds a sensor trigger that takes the lead away once a mob is in the first seat', () => {
        const data = withJavaCamelHuskLead(CAMEL_HUSK);
        expect(data).toMatchObject({
            'minecraft:entity': {
                components: {
                    'minecraft:environment_sensor': {
                        triggers: [
                            { event: 'minecraft:rider_mounted' },
                            {
                                event: 'jsprismarine:mob_rider_mounted',
                                filters: {
                                    all_of: expect.arrayContaining([
                                        { test: 'is_controlling_passenger_family', subject: 'self', value: 'mob' }
                                    ])
                                }
                            }
                        ]
                    }
                }
            }
        });

        const types = new EntityTypes();
        types.load([{ data, pack: 'test', path: 'entities/camel_husk.json' }]);
        const husk = types.spawn('minecraft:camel_husk');
        expect(husk.hasComponent('minecraft:leashable')).toBe(true);
        husk.fire('jsprismarine:mob_rider_mounted');
        husk.applyQueuedEvents();
        expect(husk.hasComponent('minecraft:leashable')).toBe(false);
    });

    it('leaves every other file as it is', () => {
        const other = { 'minecraft:entity': { description: { identifier: 'minecraft:camel' } } };
        expect(withJavaCamelHuskLead(other)).toBe(other);
    });
});
