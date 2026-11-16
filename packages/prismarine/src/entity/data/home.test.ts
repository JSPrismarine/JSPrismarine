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

const rehoming = {
    'jsprismarine:rehoming': {
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:physics': { has_gravity: false },
            'minecraft:home': { restriction_radius: 8, restriction_type: 'random_movement', rehome_beyond: 4 }
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

    it("settles a new home once it strays past its radius plus rehome_beyond, as Java's happy ghast does", () => {
        const { runtime } = entityFixture(undefined, {}, rehoming);
        const entity = runtime.spawn('jsprismarine:rehoming', GROUND);
        if (entity === undefined) throw new Error('the fixture declares no jsprismarine:rehoming');

        // Eleven blocks off is inside 8 plus 4, so the home stays.
        entity.position = { ...GROUND, x: GROUND.x + 11 };
        runtime.tick(1);
        expect(entity.instance.homePosition).toEqual(GROUND);

        entity.position = { ...GROUND, x: GROUND.x + 12 };
        runtime.tick(2);
        expect(entity.instance.homePosition).toEqual({ x: 16, y: FLOOR_Y + 1, z: 4 });
    });
});
