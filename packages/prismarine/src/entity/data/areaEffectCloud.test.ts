import { describe, expect, it } from 'vitest';

import { AREA_EFFECT_CLOUD } from './areaEffectCloud';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const ground = (x: number) => ({ x, y: FLOOR_Y + 1, z: 0.5 });

/** The dragon's breath, as Java's `DragonSittingFlamingPhase` makes it. */
const BREATH = {
    radius: 5,
    duration: 200,
    potion_duration_scale: 0.25,
    effects: [{ id: 'minecraft:instant_damage', amplifier: 0 }]
};

const breathe = () => {
    const world = new TestEntityWorld();
    const fixture = entityFixture(
        world,
        {},
        {
            'minecraft:area_effect_cloud': { components: { 'minecraft:physics': { has_collision: false } } },
            'test:plain': { components: { 'minecraft:health': { value: 20, max: 20 } } },
            'test:undead': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:type_family': { family: ['undead'] }
                }
            }
        }
    );
    const inside = fixture.runtime.spawn('test:plain', ground(3.5));
    const outside = fixture.runtime.spawn('test:plain', ground(7.5));
    const undead = fixture.runtime.spawn('test:undead', ground(-2.5));
    const cloud = fixture.runtime.spawn(AREA_EFFECT_CLOUD, ground(0.5), { data: BREATH });
    if (inside === undefined || outside === undefined || undead === undefined || cloud === undefined)
        throw new Error('the fixture declared the test entities');
    undead.instance.attributes.set('health', 10);
    const blows: { tick: number; id: number; taken: number; cause: string }[] = [];
    let gone: number | undefined;
    for (let tick = 1; tick <= 230; tick += 1) {
        const before = world.commits.length;
        world.advance();
        fixture.runtime.tick(tick);
        for (const commit of world.commits.slice(before))
            blows.push({ tick, id: commit.target.id, taken: commit.taken, cause: commit.intent.cause });
        if (gone === undefined && fixture.runtime.byId(cloud.id) === undefined) gone = tick;
    }
    return { blows, gone, inside, outside, undead };
};

describe('an area effect cloud', () => {
    it("waits 20 ticks, then deals instant damage's 3 at half strength once every 20 ticks within its radius", () => {
        const { blows, inside, outside } = breathe();
        const onInside = blows.filter((blow) => blow.id === inside.id);
        expect(onInside[0]).toEqual({ tick: 20, id: inside.id, taken: 3, cause: 'magic' });
        expect(onInside.map((blow) => blow.tick).slice(0, 3)).toEqual([20, 40, 60]);
        expect(blows.some((blow) => blow.id === outside.id)).toBe(false);
    });

    it('heals the undead instead, by 2', () => {
        const { undead } = breathe();
        expect(undead.instance.attributes.get('health')?.current).toBeGreaterThan(10);
    });

    it('is gone once its wait and its duration have run out', () => {
        expect(breathe().gone).toBe(220);
    });

    it('shrinks by its radius_on_use for each entity it reaches and is gone under half a block', () => {
        const world = new TestEntityWorld();
        const fixture = entityFixture(
            world,
            {},
            {
                'minecraft:area_effect_cloud': { components: { 'minecraft:physics': { has_collision: false } } },
                'test:plain': { components: { 'minecraft:health': { value: 20, max: 20 } } }
            }
        );
        for (let count = 0; count < 3; count += 1) fixture.runtime.spawn('test:plain', ground(0.5));
        const cloud = fixture.runtime.spawn(AREA_EFFECT_CLOUD, ground(0.5), {
            data: {
                radius: 1.5,
                radius_on_use: -0.5,
                duration: 600,
                wait_time: 0,
                effects: [{ id: 'minecraft:slowness', amplifier: 0, duration: 100 }]
            }
        });
        if (cloud === undefined) throw new Error('the fixture declared the cloud');
        for (let tick = 1; tick <= 5; tick += 1) {
            world.advance();
            fixture.runtime.tick(tick);
        }
        // Three entities take it from 1.5 to 0, under half a block.
        expect(fixture.runtime.byId(cloud.id)).toBeUndefined();
    });
});
