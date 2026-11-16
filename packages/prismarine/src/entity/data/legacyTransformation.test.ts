import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

/** A pig as Mojang's pack writes its lightning conversion: into the zombified piglin's legacy name. */
const pig = {
    components: { 'minecraft:health': { value: 10, max: 10 } },
    component_groups: {
        'minecraft:pig_transform': { 'minecraft:transformation': { into: 'minecraft:pig_zombie', delay: 0 } }
    },
    events: { become_zombie: { add: { component_groups: ['minecraft:pig_transform'] } } }
};

const piglin = { components: { 'minecraft:health': { value: 20, max: 20 } } };

describe('minecraft:transformation', () => {
    it('turns into the type a legacy Bedrock name stands for, as the pig names the zombified piglin', () => {
        const world = new TestEntityWorld();
        const fixture = entityFixture(world, {}, { 'test:pig': pig, 'minecraft:zombie_pigman': piglin });
        const entity = fixture.runtime.spawn('test:pig', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (entity === undefined) throw new Error('the fixture declared the pig');
        entity.instance.fire('become_zombie');
        for (let tick = 1; tick <= 3; tick += 1) {
            world.advance();
            fixture.runtime.tick(tick);
        }

        expect(fixture.runtime.byId(entity.id)).toBeUndefined();
        expect(fixture.runtime.near(entity.position, 2).map((other) => other.identifier)).toEqual([
            'minecraft:zombie_pigman'
        ]);
    });
});
