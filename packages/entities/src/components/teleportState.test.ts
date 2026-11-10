import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, tickThenUndo } from '../componentState.test.helper';
import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityActuator, EntityPosition } from '../hooks';

/** `minecraft:teleport`'s random teleport clock, asserted by the teleports and the state it keeps. */

const enderman = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:enderman' },
        components: {
            'minecraft:teleport': {
                min_random_teleport_time: 1,
                max_random_teleport_time: 1,
                dark_teleport_chance: 1,
                light_teleport_chance: 1
            }
        }
    }
};

/** A dark world that records where the entity teleports to. */
const world = () => {
    const teleports: EntityPosition[] = [];
    const actuator: EntityActuator = {
        position: () => ({ x: 0, y: 0, z: 0 }),
        moveTo: () => undefined,
        stopMoving: () => undefined,
        lookAt: () => undefined,
        jump: () => undefined,
        randomTarget: () => undefined,
        nearestPlayer: () => undefined,
        randomPosition: (center) => ({ x: center.x + 1, y: center.y, z: center.z }),
        teleportTo: (position) => teleports.push(position)
    };
    const environment: EntityEnvironment = {
        actuator,
        random: { next: () => 0.5 },
        filterContext: () => ({ self: { measure: (name) => (name === 'light_level' ? 0 : undefined) } })
    };
    return { teleports, environment };
};

const spawn = (environment: EntityEnvironment): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: enderman, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn('test:enderman', { environment });
};

describe('minecraft:teleport state', () => {
    it('teleports at random once per drawn interval', () => {
        const { teleports, environment } = world();
        const entity = spawn(environment);
        for (let tick = 0; tick < 40; tick += 1) entity.tick();

        expect(teleports).toHaveLength(2);
    });

    it('reports its clock and undoes it exactly', () => {
        const { environment } = world();
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(observing(writes, environment));
        const run = tickThenUndo(entity, writes, 25);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:teleport',
            before: { randomTeleportTicks: 20 },
            after: { randomTeleportTicks: 19 }
        });
        expect(run.ticked).toEqual({ 'minecraft:teleport': { randomTeleportTicks: 15 } });
        expect(run.undone).toEqual(run.before);
    });
});
