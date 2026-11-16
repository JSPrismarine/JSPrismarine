import { describe, expect, it } from 'vitest';

import type { EntityEnvironment } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityActuator, EntityPosition } from '../hooks';

/** An enderman that dodges projectiles, with no random teleports to get in the way. */
const enderman = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:enderman' },
        components: {
            'minecraft:teleport': {
                random_teleports: false,
                random_teleport_cube: [32, 32, 32],
                teleports_on_projectile_hit: true
            }
        }
    }
};

/** Spawns the enderman over an actuator whose Java landing accepts only the `landsOn`th try. */
const struck = (landsOn: number) => {
    const tries: EntityPosition[] = [];
    const actuator: EntityActuator = {
        position: () => ({ x: 0, y: 64, z: 0 }),
        moveTo: () => undefined,
        stopMoving: () => undefined,
        lookAt: () => undefined,
        jump: () => undefined,
        randomTarget: () => undefined,
        nearestPlayer: () => undefined,
        randomTeleport: (destination) => tries.push(destination) === landsOn
    };
    const draws = [0.75, 0.25, 0.5];
    let draw = 0;
    const environment: EntityEnvironment = {
        actuator,
        random: { next: () => draws[draw++ % draws.length] ?? 0, nextInt: (bound) => bound - 1 }
    };
    const types = new EntityTypes();
    types.load([{ data: enderman, pack: 'vanilla', path: 'entities/test.json' }]);
    const entity = types.spawn('test:enderman', { environment });
    // The spawn drew the random teleport clock; the strike's draws start the sequence over.
    draw = 0;
    return { evaded: entity.notifyProjectileHit({}), tries };
};

describe("minecraft:teleport's projectile dodge", () => {
    it("draws each try anywhere in the cube, as Java's Enderman.teleport does", () => {
        const { evaded, tries } = struck(1);
        expect(evaded).toBe(true);
        expect(tries).toEqual([{ x: 16, y: 64 + 63 - 32, z: -16 }]);
    });

    it("tries Java's 64 teleports and takes no hit even when none lands", () => {
        const { evaded, tries } = struck(0);
        expect(tries).toHaveLength(64);
        expect(evaded).toBe(true);
    });
});
