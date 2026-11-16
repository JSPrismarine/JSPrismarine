import { describe, expect, it } from 'vitest';

import { EntityTypes } from '../entityTypes';

/** The first entry's wait, in ticks, of a hen spawned with a fixed random draw. */
const firstWait = (draw: number): unknown => {
    const types = new EntityTypes();
    types.load([
        {
            data: {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:hen' },
                    components: {
                        'minecraft:spawn_entity': {
                            entities: { spawn_item: 'egg', min_wait_time: 300, max_wait_time: 600 }
                        }
                    }
                }
            },
            pack: 'vanilla',
            path: 'entities/hen.json'
        }
    ]);
    const hen = types.spawn('test:hen', { environment: { random: { next: () => draw } } });
    const state = hen.componentState.snapshot()['minecraft:spawn_entity'];
    return Array.isArray(state?.remaining) ? state.remaining[0] : undefined;
};

describe('minecraft:spawn_entity wait', () => {
    it("draws whole ticks from min_wait_time up to max_wait_time, as Java's nextInt(6000) + 6000 does", () => {
        expect(firstWait(0)).toBe(6000);
        expect(firstWait(1 - Number.EPSILON)).toBe(11999);
    });
});
