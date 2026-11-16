import { describe, expect, it } from 'vitest';

import type { EntityInstance, TransformRequest } from '../entityInstance';
import { EntityTypes } from '../entityTypes';

/** An entity whose base `minecraft:transformation` is the body given, with a fixed random draw. */
const converting = (
    transformation: Record<string, unknown>,
    draw: number,
    requests: TransformRequest[]
): EntityInstance => {
    const types = new EntityTypes();
    types.load([
        {
            data: {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:patient' },
                    components: { 'minecraft:transformation': transformation }
                }
            },
            pack: 'vanilla',
            path: 'entities/patient.json'
        }
    ]);
    return types.spawn('test:patient', {
        environment: {
            random: { next: () => draw },
            transform: (_entity, request) => requests.push(request)
        }
    });
};

/** The ticks until the entity asks to transform. */
const ticksToTransform = (entity: EntityInstance, requests: readonly TransformRequest[]): number => {
    let ticks = 0;
    while (requests.length === 0 && ticks < 10_000) {
        entity.tick(false);
        ticks += 1;
    }
    return ticks;
};

describe('minecraft:transformation delay', () => {
    it("adds range_min to range_max seconds to value, the zombie villager's cure time", () => {
        // Java's ZombieVillager.startConverting draws 3600 to 6000 ticks.
        const cure = { into: 'minecraft:villager_v2', delay: { value: 100, range_min: 80, range_max: 200 } };
        const quickest: TransformRequest[] = [];
        const slowest: TransformRequest[] = [];
        expect(ticksToTransform(converting(cure, 0, quickest), quickest)).toBe(3600 + 1);
        expect(ticksToTransform(converting(cure, 1 - Number.EPSILON, slowest), slowest)).toBe(6000 + 1);
    });

    it('keeps a plain delay fixed', () => {
        const requests: TransformRequest[] = [];
        expect(ticksToTransform(converting({ into: 'minecraft:skeleton', delay: 0.5 }, 0.9, requests), requests)).toBe(
            10 + 1
        );
    });

    it('turns into the current identifier of a legacy entity name', () => {
        // The vanilla pig's lightning conversion still names `pig_zombie`.
        const requests: TransformRequest[] = [];
        ticksToTransform(converting({ into: 'minecraft:pig_zombie' }, 0, requests), requests);
        expect(requests[0]?.identifier).toBe('minecraft:zombie_pigman');
    });
});
