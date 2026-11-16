import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const SUNBURNT = 'test:sunburnt';
const EMBER = 'test:ember';

const sunburnt = {
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:burns_in_daylight': {},
        'minecraft:physics': {}
    }
};

/** A magma cube's shape: Bedrock's pack gives it `minecraft:burns_in_daylight` beside its fire immunity. */
const ember = {
    components: {
        ...sunburnt.components,
        'minecraft:fire_immune': {}
    }
};

/** Whether a mob of the type stands on fire after a few ticks under the open midday sky. */
const catchesFire = (identifier: string): boolean => {
    const { runtime } = entityFixture(
        new TestEntityWorld({ dayTime: 6000, skyLight: true }),
        {},
        {
            [SUNBURNT]: sunburnt,
            [EMBER]: ember
        }
    );
    const mob = runtime.spawn(identifier, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    if (mob === undefined) throw new Error(`the fixture declared no ${identifier}`);
    for (let tick = 1; tick <= 5; tick += 1) runtime.tick(tick);
    return mob.body.conditions.has('on_fire');
};

describe('daylight burning', () => {
    it('sets a mob that burns in daylight on fire under the open sky', () => {
        expect(catchesFire(SUNBURNT)).toBe(true);
    });

    it('leaves a fire-immune mob unlit, as Java does for a magma cube or a wither skeleton', () => {
        expect(catchesFire(EMBER)).toBe(false);
    });
});
