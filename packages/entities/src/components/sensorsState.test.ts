import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, tickThenUndo } from '../componentState.test.helper';
import type { EntityEnvironment, EntityInstance, EntityTargetProximity } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityActuator, EntityBlockState, EntityPosition } from '../hooks';

/**
 * The sensors of `sensors.ts` that remember something between ticks, asserted by the sounds their
 * events play and by the state they keep on the instance.
 */

const sensing = (identifier: string, components: Record<string, unknown>, sounds: readonly string[]) => ({
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier },
        components,
        events: Object.fromEntries(sounds.map((sound) => [`test:${sound}`, { play_sound: { sound } }]))
    }
});

const watcher = sensing(
    'test:watcher',
    {
        'minecraft:entity_sensor': {
            subsensors: [{ range: [4, 4], cooldown: 1, event: 'test:seen' }]
        }
    },
    ['seen']
);

const wader = sensing(
    'test:wader',
    {
        'minecraft:inside_block_notifier': {
            block_list: [
                {
                    block: { name: 'minecraft:water' },
                    entered_block_event: { event: 'test:entered', target: 'self' },
                    exited_block_event: { event: 'test:left', target: 'self' }
                }
            ]
        }
    },
    ['entered', 'left']
);

const hunter = sensing(
    'test:hunter',
    {
        'minecraft:target_nearby_sensor': {
            inside_range: 2,
            outside_range: 6,
            on_inside_range: { event: 'test:close', target: 'self' },
            on_outside_range: { event: 'test:far', target: 'self' }
        }
    },
    ['close', 'far']
);

/** What the world double shows the sensors, which a test changes between ticks. */
interface Scene {
    candidates: number;
    position: EntityPosition;
    block: string;
    target?: EntityTargetProximity;
}

/** A world double that records played sounds and lets a test move what the sensors see. */
const world = () => {
    const played: string[] = [];
    const scene: Scene = { candidates: 0, position: { x: 0.5, y: 0, z: 0.5 }, block: 'minecraft:air' };
    const actuator: EntityActuator = {
        position: () => scene.position,
        moveTo: () => undefined,
        stopMoving: () => undefined,
        lookAt: () => undefined,
        jump: () => undefined,
        randomTarget: () => undefined,
        nearestPlayer: () => undefined
    };
    const environment: EntityEnvironment = {
        actuator,
        effects: { playSound: (_entity, sound) => played.push(sound) },
        entitySensorCandidates: () => Array.from({ length: scene.candidates }, () => ({ view: {} })),
        blockAt: (): EntityBlockState => ({ identifier: scene.block, states: {} }),
        targetProximity: () => scene.target
    };
    return { played, scene, environment };
};

const spawn = (data: unknown, identifier: string, environment: EntityEnvironment): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn(identifier, { environment });
};

const tick = (entity: EntityInstance, times: number): void => {
    for (let count = 0; count < times; count += 1) entity.tick();
};

describe('minecraft:entity_sensor state', () => {
    it('fires while a candidate is in range, once per cooldown', () => {
        const { played, scene, environment } = world();
        const entity = spawn(watcher, 'test:watcher', environment);
        tick(entity, 5);
        expect(played).toEqual([]);

        scene.candidates = 1;
        tick(entity, 43);

        expect(played).toEqual(['seen', 'seen']);
    });

    it('reports its cooldown and undoes it exactly', () => {
        const { scene, environment } = world();
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(watcher, 'test:watcher', observing(writes, environment));
        scene.candidates = 1;
        const run = tickThenUndo(entity, writes, 5);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:entity_sensor',
            before: { cooldowns: [0] },
            after: { cooldowns: [20] }
        });
        expect(run.ticked).toEqual({ 'minecraft:entity_sensor': { cooldowns: [16] } });
        expect(run.undone).toEqual(run.before);
    });
});

describe('minecraft:inside_block_notifier state', () => {
    it('fires on entering and on leaving a matching block, once each', () => {
        const { played, scene, environment } = world();
        const entity = spawn(wader, 'test:wader', environment);
        tick(entity, 2);
        scene.block = 'minecraft:water';
        tick(entity, 3);
        scene.block = 'minecraft:air';
        tick(entity, 3);

        expect(played).toEqual(['entered', 'left']);
    });

    it('reports which blocks it is inside and undoes them exactly', () => {
        const { scene, environment } = world();
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(wader, 'test:wader', observing(writes, environment));
        scene.block = 'minecraft:water';
        const run = tickThenUndo(entity, writes, 3);

        expect(run.writes).toEqual([
            { component: 'minecraft:inside_block_notifier', before: { inside: [] }, after: { inside: [0] } }
        ]);
        expect(run.undone).toEqual(run.before);
    });
});

describe('minecraft:target_nearby_sensor state', () => {
    it('fires on the target coming close and on it moving away', () => {
        const { played, scene, environment } = world();
        const entity = spawn(hunter, 'test:hunter', environment);
        scene.target = { id: 7, distance: 1, visible: true };
        tick(entity, 3);
        scene.target = { id: 7, distance: 10, visible: true };
        tick(entity, 3);

        expect(played).toEqual(['close', 'far']);
    });

    it('remembers the target by id, and undoes that exactly', () => {
        const { scene, environment } = world();
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(hunter, 'test:hunter', observing(writes, environment));
        scene.target = { id: 7, distance: 1, visible: true };
        const run = tickThenUndo(entity, writes, 3);

        expect(run.ticked).toEqual({
            'minecraft:target_nearby_sensor': {
                targetId: 7,
                inRange: true,
                visibleInsideRange: true,
                insideEventFired: true
            }
        });
        expect(run.writes).toHaveLength(1);
        expect(run.undone).toEqual(run.before);
    });

    it('leaves the target out of the saved form, so a reload starts with no target', () => {
        const { played, scene, environment } = world();
        const entity = spawn(hunter, 'test:hunter', environment);
        scene.target = { id: 7, distance: 1, visible: true };
        tick(entity, 3);
        const saved = entity.componentState.snapshot();

        expect(saved).not.toHaveProperty(['minecraft:target_nearby_sensor']);

        // A record written before the state was marked session-only still carries it.
        const reloaded = spawn(hunter, 'test:hunter', environment);
        reloaded.componentState.restore({
            ...saved,
            'minecraft:target_nearby_sensor': {
                targetId: 7,
                inRange: true,
                visibleInsideRange: true,
                insideEventFired: true
            }
        });
        expect(Object.fromEntries(reloaded.componentState.entries())['minecraft:target_nearby_sensor']).toEqual({
            targetId: null,
            inRange: false,
            visibleInsideRange: false,
            insideEventFired: false
        });

        // The target the new session's runtime id names is met as a new one, so the event fires again.
        played.length = 0;
        tick(reloaded, 3);
        expect(played).toEqual(['close']);
    });
});
