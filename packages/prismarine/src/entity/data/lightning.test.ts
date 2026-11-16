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

/** A mob whose pack multiplies lightning damage two thousandfold, as the axolotl's and the turtle's does. */
const fragile = {
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:damage_sensor': {
            triggers: [{ cause: 'lightning', deals_damage: 'yes', damage_multiplier: 2000 }]
        }
    }
};

const ground = (x: number) => ({ x, y: FLOOR_Y + 1, z: 0.5 });

const strike = () => {
    const world = new TestEntityWorld();
    const fixture = entityFixture(
        world,
        {},
        {
            'minecraft:lightning_bolt': bolt,
            'test:conductor': conductor,
            'minecraft:pig': conductor,
            'test:plain': plain,
            'test:fragile': fragile,
            'minecraft:turtle': fragile
        }
    );
    const at = (identifier: string, x: number) => {
        const spawned = fixture.runtime.spawn(identifier, { ...ground(x), z: x > 0 ? 0.5 : 2.5 });
        if (spawned === undefined) throw new Error(`the fixture declares ${identifier}`);
        return spawned;
    };
    const near = at('test:plain', 2.5);
    const far = at('test:plain', 10.5);
    const sensed = at('test:conductor', -1.5);
    const pig = at('minecraft:pig', -0.5);
    const axolotl = at('test:fragile', 1.5);
    const turtle = at('minecraft:turtle', -2.5);
    const lightning = at('minecraft:lightning_bolt', 0.5);
    return { fixture, world, near, far, sensed, pig, axolotl, turtle, lightning };
};

const runStrike = (ticks: number) => {
    const struck = strike();
    for (let tick = 1; tick <= ticks; tick += 1) {
        struck.world.advance();
        struck.fixture.runtime.tick(tick);
    }
    return struck;
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

    it("reaches a damage sensor that names the lightning family, and still deals Java's 5 as Creeper.thunderHit does", () => {
        const { sensed } = runStrike(2);

        expect(sensed.instance.hasComponent('minecraft:is_charged')).toBe(true);
        expect(sensed.instance.attributes.get('health')?.current).toBe(15);
    });

    it("deals Java's 5 to a type whose pack multiplies lightning damage, as Java's axolotl takes it", () => {
        expect(runStrike(2).axolotl.instance.attributes.get('health')?.current).toBe(15);
    });

    it("leaves the damage to the pack for a type whose Java thunderHit replaces it, such as the pig's and the turtle's", () => {
        const { pig, turtle, world } = runStrike(2);

        expect(pig.instance.hasComponent('minecraft:is_charged')).toBe(true);
        const pigHealth = pig.instance.attributes.get('health');
        expect(pigHealth?.current).toBe(pigHealth?.max);
        expect(world.commits.some((commit) => commit.target.id === turtle.id && commit.died)).toBe(true);
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
