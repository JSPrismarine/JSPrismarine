import { describe, expect, it } from 'vitest';

import type { EntityEnvironment, EntityInstance, LookedAtCandidate, LookedAtQuery } from '../entityInstance';
import { EntityTypes } from '../entityTypes';

/** `minecraft:looked_at`: a stare that lasts long enough targets the player and raises the events. */

const definition = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:watched' },
        components: {
            'minecraft:looked_at': {
                min_looked_at_duration: 0.25,
                set_target: 'once_and_keep_scanning',
                looked_at_event: { event: 'test:seen', filter: 'self' },
                not_looked_at_event: { event: 'test:unseen', filter: 'self' }
            }
        },
        events: { 'test:seen': {}, 'test:unseen': {} }
    }
};

const PLAYER: LookedAtCandidate = { id: 7, view: { id: () => 7 } };

const spawn = (environment: EntityEnvironment): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: definition, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn('test:watched', { environment });
};

describe('minecraft:looked_at', () => {
    it("asks for the default field of view as Java's enderman tolerance, and targets after the stare lasts", () => {
        let looking = true;
        const queries: LookedAtQuery[] = [];
        const targeted: number[] = [];
        const entity = spawn({
            lookers: (_entity, query) => {
                queries.push(query);
                return looking ? [PLAYER] : [];
            },
            targetLooker: (_entity, looker) => targeted.push(looker.id)
        });
        const events: string[] = [];
        const raise = entity.raise.bind(entity);
        entity.raise = (event, target, source) => {
            events.push(event);
            return raise(event, target, source);
        };

        for (let tick = 0; tick < 4; tick += 1) entity.tick();
        expect(targeted).toEqual([]);
        entity.tick();
        expect(targeted).toEqual([7]);
        expect(events).toEqual(['test:seen']);
        // The default 26 degrees is a tolerance of `1 - cos(13)`, which scales by distance.
        expect(queries[0]?.tolerance).toBeCloseTo(1 - Math.cos((13 * Math.PI) / 180), 9);
        expect(queries[0]?.scaleByDistance).toBe(true);

        looking = false;
        entity.tick();
        expect(events).toEqual(['test:seen', 'test:unseen']);
    });
});
