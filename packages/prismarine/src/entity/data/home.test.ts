import { describe, expect, it } from 'vitest';

import { dataEntityRecordOf } from './persistence';
import { entityFixture, FLOOR_Y } from './testing';

const GROUND = { x: 4.5, y: FLOOR_Y + 1, z: 4.5 };

const homed = {
    'jsprismarine:homed': {
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:home': { restriction_radius: 16, restriction_type: 'random_movement' }
        }
    }
};

describe("a data entity's home", () => {
    it('is where minecraft:home put it, for the body, the goals and the save alike', () => {
        const { runtime } = entityFixture(undefined, {}, homed);
        const entity = runtime.spawn('jsprismarine:homed', GROUND);
        if (entity === undefined) throw new Error('the fixture declares no jsprismarine:homed');

        expect(entity.instance.homePosition).toEqual(GROUND);
        expect(entity.body.home).toEqual(GROUND);
        expect(dataEntityRecordOf(entity, undefined).home).toEqual(GROUND);
    });

    it('moves the instance home when the body records a new one', () => {
        const { runtime } = entityFixture(undefined, {}, homed);
        const entity = runtime.spawn('jsprismarine:homed', GROUND);
        if (entity === undefined) throw new Error('the fixture declares no jsprismarine:homed');
        const elsewhere = { x: 30.5, y: FLOOR_Y + 1, z: 4.5 };

        entity.body.home = elsewhere;

        expect(entity.instance.homePosition).toEqual(elsewhere);
    });
});
