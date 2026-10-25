import { describe, expect, it } from 'vitest';

import type { EntityEnvironment, EntityInstance } from './entityInstance';
import { EntityTypes } from './entityTypes';
import type { EntityPosition } from './hooks';

/**
 * The nine event actions, each asserted by what it changed: a line in the
 * world double's log, the entity's home position, or the entity's target.
 */

const noise = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:noisy', is_spawnable: true, is_summonable: true },
        components: { 'minecraft:physics': {} },
        events: {
            'test:sound': { play_sound: { sound: 'mob.cow.say' } },
            'test:particle': { emit_particle: { particle: 'creakingcrumble' } },
            'test:vibration': { emit_vibration: { vibration: 'entity_die' } },
            'test:command': { queue_command: { command: 'say I have died!' } },
            'test:command_on_player': { queue_command: { command: ['one', 'two'], target: 'player' } },
            'test:drop': { drop_item: { slot: 'slot.weapon.mainhand' } },
            'test:home': { set_home_position: {} },
            'test:home_block': { execute_event_on_home_block: { event: 'test:crumble' } },
            'test:stop': { stop_movement: {} },
            'test:clear_target': { reset_target: {} },
            'test:unknown': { spin_around: { times: 3 } },
            'test:broken_sound': { play_sound: {} }
        }
    }
};

/** A world double that records every effect it is asked to carry out. */
const world = () => {
    const log: string[] = [];
    return {
        log,
        effects: {
            playSound: (_entity: EntityInstance, sound: string) => log.push(`playSound ${sound}`),
            emitParticle: (_entity: EntityInstance, particle: string) => log.push(`emitParticle ${particle}`),
            emitVibration: (_entity: EntityInstance, kind: string) => log.push(`emitVibration ${kind}`),
            queueCommand: (_entity: EntityInstance, command: string, target: string) =>
                log.push(`queueCommand ${target} ${command}`),
            dropItem: (_entity: EntityInstance, slot: string) => log.push(`dropItem ${slot}`),
            executeEventOnBlock: (_entity: EntityInstance, position: EntityPosition, event: string) =>
                log.push(`executeEventOnBlock ${position.x},${position.y},${position.z} ${event}`)
        }
    };
};

/** An actuator double that stands at one position and records movement. */
const standing = (position: EntityPosition) => {
    const log: string[] = [];
    return {
        log,
        actuator: {
            position: () => position,
            moveTo: () => log.push('moveTo'),
            stopMoving: () => log.push('stopMoving'),
            lookAt: () => log.push('lookAt'),
            jump: () => log.push('jump'),
            randomTarget: () => position,
            nearestPlayer: () => position
        }
    };
};

const spawn = (environment: EntityEnvironment = {}): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: noise, pack: 'vanilla', path: 'entities/noisy.json' }]);
    return types.spawn('test:noisy', { environment });
};

/** Fires an event and ticks once, which is when an event's effects land. */
const run = (entity: EntityInstance, event: string): void => {
    entity.fire(event);
    entity.tick();
};

describe('event actions that leave the package', () => {
    it('plays a sound through the world', () => {
        const { log, effects } = world();
        run(spawn({ effects }), 'test:sound');

        expect(log).toEqual(['playSound mob.cow.say']);
    });

    it('emits a particle and a vibration through the world', () => {
        const { log, effects } = world();
        const entity = spawn({ effects });
        run(entity, 'test:particle');
        run(entity, 'test:vibration');

        expect(log).toEqual(['emitParticle creakingcrumble', 'emitVibration entity_die']);
    });

    it('queues one command on self and a list of commands on a named target', () => {
        const { log, effects } = world();
        const entity = spawn({ effects });
        run(entity, 'test:command');
        run(entity, 'test:command_on_player');

        expect(log).toEqual([
            'queueCommand self say I have died!',
            'queueCommand player one',
            'queueCommand player two'
        ]);
    });

    it('drops the named slot', () => {
        const { log, effects } = world();
        run(spawn({ effects }), 'test:drop');

        expect(log).toEqual(['dropItem slot.weapon.mainhand']);
    });

    it('reports an action whose member the environment leaves out', () => {
        const reported: string[] = [];
        run(spawn({ report: (message) => reported.push(message) }), 'test:sound');

        expect(reported).toEqual(['test:sound asks for play_sound, which nothing in the world carries out']);
    });

    it('reports an action key the package does not carry out', () => {
        const reported: string[] = [];
        run(spawn({ report: (message) => reported.push(message) }), 'test:unknown');

        expect(reported).toEqual(['test:unknown asks for spin_around, which this package does not carry out']);
    });

    it('leaves an action with an unusable body unparsed and reports the load', () => {
        const types = new EntityTypes();
        const diagnostics = types.load([{ data: noise, pack: 'vanilla', path: 'entities/noisy.json' }]);

        expect(diagnostics.map((entry) => entry.message)).toEqual([
            'test:noisy event test:broken_sound: play_sound needs a sound'
        ]);
    });
});

describe('event actions the package carries out itself', () => {
    it('records the entity position as its home and measures the distance back to it', () => {
        const { actuator } = standing({ x: 10, y: 64, z: -4 });
        const entity = spawn({ actuator });

        expect(entity.homePosition).toBeUndefined();

        run(entity, 'test:home');

        expect(entity.homePosition).toEqual({ x: 10, y: 64, z: -4 });
        expect(entity.filterContext().self.measure?.('home_distance')).toBe(0);
    });

    it('fires an event on the home block once a home is set', () => {
        const { log, effects } = world();
        const { actuator } = standing({ x: 1, y: 2, z: 3 });
        const entity = spawn({ effects, actuator });
        run(entity, 'test:home');
        run(entity, 'test:home_block');

        expect(log).toEqual(['executeEventOnBlock 1,2,3 test:crumble']);
    });

    it('reports a home block event when the entity has no home yet', () => {
        const reported: string[] = [];
        const { effects } = world();
        const { actuator } = standing({ x: 1, y: 2, z: 3 });
        run(spawn({ effects, actuator, report: (message) => reported.push(message) }), 'test:home_block');

        expect(reported).toEqual([
            'test:home_block asks for execute_event_on_home_block, which nothing in the world carries out'
        ]);
    });

    it('stops the path through the actuator', () => {
        const { log, actuator } = standing({ x: 0, y: 0, z: 0 });
        run(spawn({ actuator }), 'test:stop');

        expect(log).toEqual(['stopMoving']);
    });

    it('clears the attack target', () => {
        const entity = spawn();
        entity.setAttackTarget({ id: () => 'wolf' });

        expect(entity.filterContext().self.flag?.('has_target')).toBe(true);

        run(entity, 'test:clear_target');

        expect(entity.attackTarget).toBeUndefined();
        expect(entity.filterContext().self.flag?.('has_target')).toBe(false);
    });
});
