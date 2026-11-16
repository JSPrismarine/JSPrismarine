import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

/** A bolt, as Mojang's pack declares it: a type family and nothing else. */
const bolt = { components: { 'minecraft:type_family': { family: ['lightning'] } } };

/** A mob whose damage sensor turns a lightning strike into an event, as a pig's does. */
const conductor = {
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:damage_sensor': {
            triggers: [
                {
                    deals_damage: 'no',
                    on_damage: {
                        event: 'test:struck',
                        filters: { test: 'is_family', subject: 'other', value: 'lightning' }
                    }
                }
            ]
        }
    },
    component_groups: { 'test:struck': { 'minecraft:is_charged': {} } },
    events: { 'test:struck': { add: { component_groups: ['test:struck'] } } }
};

const plain = { components: { 'minecraft:health': { value: 20, max: 20 } } };

const ground = (x: number) => ({ x, y: FLOOR_Y + 1, z: 0.5 });

const strike = () => {
    const world = new TestEntityWorld();
    const fixture = entityFixture(
        world,
        {},
        { 'minecraft:lightning_bolt': bolt, 'test:conductor': conductor, 'test:plain': plain }
    );
    const near = fixture.runtime.spawn('test:plain', ground(2.5));
    const far = fixture.runtime.spawn('test:plain', ground(10.5));
    const sensed = fixture.runtime.spawn('test:conductor', ground(-1.5));
    const lightning = fixture.runtime.spawn('minecraft:lightning_bolt', ground(0.5));
    if (near === undefined || far === undefined || sensed === undefined || lightning === undefined)
        throw new Error('the fixture declared the test entities');
    return { fixture, world, near, far, sensed, lightning };
};

describe('a lightning bolt', () => {
    it("strikes what stands within three blocks once, with Java's 5 damage and 8 seconds of fire", () => {
        const { fixture, world, near, far } = strike();
        for (let tick = 1; tick <= 3; tick += 1) {
            world.advance();
            fixture.runtime.tick(tick);
        }

        expect(near.instance.attributes.get('health')?.current).toBe(15);
        expect(near.body.fireTicks).toBeGreaterThan(0);
        expect(far.instance.attributes.get('health')?.current).toBe(20);
    });

    it('reaches a damage sensor that names the lightning family', () => {
        const { fixture, world, sensed } = strike();
        for (let tick = 1; tick <= 2; tick += 1) {
            world.advance();
            fixture.runtime.tick(tick);
        }

        expect(sensed.instance.hasComponent('minecraft:is_charged')).toBe(true);
        expect(sensed.instance.attributes.get('health')?.current).toBe(20);
    });

    it('strikes nothing when it is visual only, as the skeleton trap calls its bolt', () => {
        const world = new TestEntityWorld();
        const fixture = entityFixture(world, {}, { 'minecraft:lightning_bolt': bolt, 'test:plain': plain });
        const near = fixture.runtime.spawn('test:plain', ground(1.5));
        fixture.runtime.spawn('minecraft:lightning_bolt', ground(0.5), { data: { visual_only: true } });
        for (let tick = 1; tick <= 3; tick += 1) {
            world.advance();
            fixture.runtime.tick(tick);
        }

        expect(near?.instance.attributes.get('health')?.current).toBe(20);
        expect(near?.body.fireTicks).toBe(0);
    });

    it('goes once its life has run out', () => {
        const { fixture, lightning } = strike();
        for (let tick = 1; tick <= 4; tick += 1) fixture.runtime.tick(tick);

        expect(fixture.runtime.byId(lightning.id)).toBeUndefined();
        expect(fixture.removed.map(({ reason }) => reason)).toContain('lightning_spent');
    });
});
