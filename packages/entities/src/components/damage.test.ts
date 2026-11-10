import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, tickThenUndo } from '../componentState.test.helper';
import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityFlag } from '../filterContext';
import { HURT_INTERVAL_TICKS, SUFFOCATION_DAMAGE } from './vanilla';

/**
 * The components that hurt an entity on a schedule, asserted by the health
 * each one leaves behind after a counted number of ticks.
 */

const toad = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:toad' },
        components: {
            'minecraft:health': { value: 40, max: 40 },
            'minecraft:hurt_on_condition': {
                damage_conditions: [
                    { filters: { test: 'in_lava', subject: 'self' }, cause: 'lava', damage_per_tick: 4 }
                ]
            }
        }
    }
};

const burnt = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:burnt' },
        components: {
            'minecraft:health': { value: 40, max: 40 },
            'minecraft:fire_immune': {},
            'minecraft:hurt_on_condition': {
                damage_conditions: [
                    { filters: { test: 'in_lava', subject: 'self' }, cause: 'lava', damage_per_tick: 4 }
                ]
            }
        }
    }
};

const vex = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:vex' },
        components: {
            'minecraft:health': { value: 40, max: 40 },
            'minecraft:damage_over_time': { damage_per_hurt: 1, time_between_hurt: 1 }
        }
    }
};

const diver = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:diver' },
        components: {
            'minecraft:health': { value: 40, max: 40 },
            'minecraft:breathable': { total_supply: 2, suffocate_time: 0 }
        }
    }
};

const fish = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:fish' },
        components: {
            'minecraft:health': { value: 40, max: 40 },
            'minecraft:breathable': { total_supply: 2, suffocate_time: 0, breathes_water: true, breathes_air: false }
        }
    }
};

const spawn = (data: unknown, identifier: string, environment: EntityEnvironment = {}): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn(identifier, { environment });
};

/** An environment whose entity view answers one flag as true and the rest as false. */
const standingIn = (flag: EntityFlag): EntityEnvironment => ({
    filterContext: () => ({ self: { flag: (name) => name === flag } })
});

const tick = (entity: EntityInstance, times: number): void => {
    for (let count = 0; count < times; count += 1) entity.tick();
};

describe('minecraft:hurt_on_condition', () => {
    it('hurts once per hurt interval while the condition holds', () => {
        const entity = spawn(toad, 'test:toad', standingIn('in_lava'));
        tick(entity, 1);

        expect(entity.attributes.value('health')).toBe(36);

        tick(entity, HURT_INTERVAL_TICKS - 1);

        expect(entity.attributes.value('health')).toBe(36);

        tick(entity, 1);

        expect(entity.attributes.value('health')).toBe(32);
    });

    it('hurts nothing while the condition does not hold', () => {
        const entity = spawn(toad, 'test:toad', standingIn('in_water'));
        tick(entity, 40);

        expect(entity.attributes.value('health')).toBe(40);
    });

    it('lets an immunity turn its cause aside', () => {
        const entity = spawn(burnt, 'test:burnt', standingIn('in_lava'));
        tick(entity, 40);

        expect(entity.attributes.value('health')).toBe(40);
    });
});

describe('minecraft:damage_over_time', () => {
    it('hurts every time_between_hurt seconds while it is active', () => {
        const entity = spawn(vex, 'test:vex');
        tick(entity, 19);

        expect(entity.attributes.value('health')).toBe(40);

        tick(entity, 1);

        expect(entity.attributes.value('health')).toBe(39);

        tick(entity, 20);

        expect(entity.attributes.value('health')).toBe(38);
    });
});

describe('minecraft:breathable', () => {
    it('spends the air supply before it suffocates', () => {
        const entity = spawn(diver, 'test:diver', standingIn('in_water'));
        tick(entity, 40);

        expect(entity.attributes.value('health')).toBe(40);

        tick(entity, HURT_INTERVAL_TICKS);

        expect(entity.attributes.value('health')).toBe(40 - SUFFOCATION_DAMAGE);
    });

    it('refills the supply once the entity is back in a medium it breathes', () => {
        const entity = spawn(diver, 'test:diver', standingIn('in_water'));
        tick(entity, 40);

        const surfaced = spawn(diver, 'test:diver');
        tick(surfaced, 200);

        expect(surfaced.attributes.value('health')).toBe(40);
    });

    it('drowns a water breather in air instead', () => {
        const entity = spawn(fish, 'test:fish', standingIn('in_water'));
        tick(entity, 200);

        expect(entity.attributes.value('health')).toBe(40);

        const beached = spawn(fish, 'test:fish');
        tick(beached, 40 + HURT_INTERVAL_TICKS);

        expect(beached.attributes.value('health')).toBe(40 - SUFFOCATION_DAMAGE);
    });
});

describe('hazard component state', () => {
    it('reports the hurt countdown of minecraft:hurt_on_condition and undoes it exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(toad, 'test:toad', observing(writes, standingIn('in_lava')));
        const run = tickThenUndo(entity, writes, 3);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:hurt_on_condition',
            before: { remaining: 0 },
            after: { remaining: HURT_INTERVAL_TICKS }
        });
        expect(run.ticked['minecraft:hurt_on_condition']).toEqual({ remaining: HURT_INTERVAL_TICKS - 2 });
        expect(run.undone).toEqual(run.before);
    });

    it('writes nothing while minecraft:hurt_on_condition has no condition to act on', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(toad, 'test:toad', observing(writes));

        expect(tickThenUndo(entity, writes, 20).writes).toEqual([]);
    });

    it('reports the countdown of minecraft:damage_over_time and undoes it exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(vex, 'test:vex', observing(writes));
        const run = tickThenUndo(entity, writes, 25);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:damage_over_time',
            before: { remaining: 20 },
            after: { remaining: 19 }
        });
        expect(run.ticked['minecraft:damage_over_time']).toEqual({ remaining: 15 });
        expect(run.undone).toEqual(run.before);
    });

    it('reports the air supply of minecraft:breathable and undoes it exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(diver, 'test:diver', observing(writes, standingIn('in_water')));
        const run = tickThenUndo(entity, writes, 45);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:breathable',
            before: { remaining: 40, untilHurt: HURT_INTERVAL_TICKS },
            after: { remaining: 39, untilHurt: HURT_INTERVAL_TICKS }
        });
        expect(run.ticked['minecraft:breathable']).toEqual({ remaining: 0, untilHurt: HURT_INTERVAL_TICKS - 5 });
        expect(run.undone).toEqual(run.before);
    });

    it('lets a host write an earlier air supply back and resumes from it', () => {
        const entity = spawn(diver, 'test:diver', standingIn('in_water'));
        tick(entity, 39);
        const saved = entity.componentState.snapshot();

        tick(entity, 1 + HURT_INTERVAL_TICKS);
        expect(entity.attributes.value('health')).toBe(40 - SUFFOCATION_DAMAGE);

        entity.componentState.restore(saved);
        tick(entity, 1 + HURT_INTERVAL_TICKS);

        expect(entity.attributes.value('health')).toBe(40 - 2 * SUFFOCATION_DAMAGE);
    });
});

describe('minecraft:persistent', () => {
    const wanderer = (persistent: boolean) => ({
        format_version: '1.26.50',
        'minecraft:entity': {
            description: { identifier: 'test:wanderer' },
            components: {
                'minecraft:despawn': { despawn_from_distance: { min_distance: 32, max_distance: 48 } },
                ...(persistent ? { 'minecraft:persistent': {} } : {})
            }
        }
    });

    const faraway: EntityEnvironment = {
        filterContext: () => ({
            self: { measure: (name) => (name === 'distance_to_nearest_player' ? 200 : undefined) }
        })
    };

    it('despawns a mob that is far enough away', () => {
        const removed: string[] = [];
        const entity = spawn(wanderer(false), 'test:wanderer', {
            ...faraway,
            remove: (_entity, reason) => removed.push(reason)
        });
        tick(entity, 1);

        expect(removed).toEqual(['despawn beyond max_distance']);
    });

    it('keeps a persistent mob whatever the distance', () => {
        const removed: string[] = [];
        const entity = spawn(wanderer(true), 'test:wanderer', {
            ...faraway,
            remove: (_entity, reason) => removed.push(reason)
        });
        tick(entity, 40);

        expect(removed).toEqual([]);
    });
});
