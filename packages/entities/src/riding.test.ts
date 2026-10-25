import { describe, expect, it } from 'vitest';

import type { EntityInstance } from './entityInstance';
import { EntityTypes } from './entityTypes';

/**
 * `minecraft:rideable`, asserted by who is in the seats and what the riding
 * filter facts answer afterwards.
 */

const horse = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:horse', is_spawnable: true },
        components: {
            'minecraft:type_family': { family: ['horse', 'mob'] },
            'minecraft:rideable': {
                seat_count: 1,
                family_types: ['player'],
                seats: { position: [0, 1.1, -0.2] },
                on_rider_enter_event: 'test:mounted',
                on_rider_exit_event: 'test:dismounted'
            }
        },
        component_groups: { 'test:carrying': { 'minecraft:is_saddled': {} } },
        events: {
            'test:mounted': { add: { component_groups: ['test:carrying'] } },
            'test:dismounted': { remove: { component_groups: ['test:carrying'] } }
        }
    }
};

const boat = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:boat' },
        components: {
            'minecraft:type_family': { family: ['boat'] },
            'minecraft:rideable': { seat_count: 2, seats: [{ position: [0, 0, 0] }, { position: [0.2, 0, 0] }] }
        }
    }
};

/** A mount whose `minecraft:rideable` lives only in the saddled group. */
const donkey = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:donkey' },
        components: { 'minecraft:type_family': { family: ['donkey'] } },
        component_groups: {
            'test:saddled': {
                'minecraft:rideable': { seat_count: 1, family_types: ['player'], seats: { position: [0, 1, 0] } }
            }
        },
        events: {
            'test:saddle': { add: { component_groups: ['test:saddled'] } },
            'test:unsaddle': { remove: { component_groups: ['test:saddled'] } }
        }
    }
};

const rider = (identifier: string, family: string) => ({
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier },
        components: { 'minecraft:type_family': { family: [family] } }
    }
});

/** Loads every file into one registry so a rider and a vehicle can meet. */
const world = (...files: unknown[]) => {
    const types = new EntityTypes();
    types.load(files.map((data, index) => ({ data, pack: 'vanilla', path: `entities/${index}.json` })));
    return (identifier: string): EntityInstance => types.spawn(identifier);
};

describe('minecraft:rideable', () => {
    it('seats a rider of an allowed family and fires the enter event', () => {
        const spawn = world(horse, rider('test:player', 'player'));
        const mount = spawn('test:horse');
        const player = spawn('test:player');

        expect(mount.mount(player)).toBe(true);
        expect(mount.riders).toEqual([player]);
        expect(player.vehicle).toBe(mount);

        mount.tick();

        expect(mount.hasComponent('minecraft:is_saddled')).toBe(true);
    });

    it('answers the riding filter facts from the seats', () => {
        const spawn = world(horse, rider('test:player', 'player'));
        const mount = spawn('test:horse');
        const player = spawn('test:player');
        mount.mount(player);

        expect(mount.filterContext().self.measure?.('rider_count')).toBe(1);
        expect(mount.filterContext().self.names?.('is_controlling_passenger_family')).toEqual(['player']);
        expect(player.filterContext().self.flag?.('is_riding')).toBe(true);
        expect(player.filterContext().self.vehicle?.()?.names?.('is_family')).toEqual(['horse', 'mob']);
    });

    it('turns away a rider of a family the component does not list', () => {
        const spawn = world(horse, rider('test:pig', 'pig'));
        const mount = spawn('test:horse');

        expect(mount.mount(spawn('test:pig'))).toBe(false);
        expect(mount.riders).toEqual([]);
    });

    it('fills the seats and turns the next rider away', () => {
        const spawn = world(boat, rider('test:player', 'player'));
        const vessel = spawn('test:boat');

        expect(vessel.mount(spawn('test:player'))).toBe(true);
        expect(vessel.mount(spawn('test:player'))).toBe(true);
        expect(vessel.mount(spawn('test:player'))).toBe(false);
        expect(vessel.riders).toHaveLength(2);
    });

    it('moves a rider off whatever it was riding before', () => {
        const spawn = world(boat, rider('test:player', 'player'));
        const first = spawn('test:boat');
        const second = spawn('test:boat');
        const player = spawn('test:player');
        first.mount(player);
        second.mount(player);

        expect(first.riders).toEqual([]);
        expect(second.riders).toEqual([player]);
    });

    it('refuses to let a vehicle ride its own passenger', () => {
        const spawn = world(boat);
        const lower = spawn('test:boat');
        const upper = spawn('test:boat');
        lower.mount(upper);

        expect(upper.mount(lower)).toBe(false);
    });

    it('fires the exit event when a rider leaves', () => {
        const spawn = world(horse, rider('test:player', 'player'));
        const mount = spawn('test:horse');
        const player = spawn('test:player');
        mount.mount(player);
        mount.tick();
        mount.dismount(player);
        mount.tick();

        expect(mount.hasComponent('minecraft:is_saddled')).toBe(false);
        expect(player.vehicle).toBeUndefined();
    });

    it('empties the seats when the group carrying rideable is removed', () => {
        const spawn = world(donkey, rider('test:player', 'player'));
        const mount = spawn('test:donkey');
        const player = spawn('test:player');

        expect(mount.mount(player)).toBe(false);

        mount.fire('test:saddle');
        mount.tick();
        mount.mount(player);
        mount.fire('test:unsaddle');
        mount.tick();

        expect(mount.riders).toEqual([]);
        expect(player.vehicle).toBeUndefined();
    });
});
