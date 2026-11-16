import { describe, expect, it } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
import type { ExtraEntities } from './testing';
import { entityFixture, entityFixtureStack, FLOOR_Y, TestEntityWorld } from './testing';

/**
 * How a body moves through the air, ladders, cobwebs and over ledges, against Java's
 * `LivingEntity.travel` and `Entity.move`.
 */

/** The ground the fixture world's floor puts a body's feet on. */
const GROUND = FLOOR_Y + 1;

/** A walker Java's attribute dump knows as a pig, so it travels as a Java living entity. */
const PIG = {
    components: {
        'minecraft:health': { value: 10, max: 10 },
        'minecraft:movement': { value: 0.25 },
        'minecraft:physics': {},
        'minecraft:jump.static': {},
        'minecraft:navigation.walk': {},
        'minecraft:collision_box': { width: 0.9, height: 0.9 }
    },
    component_groups: { baby: { 'minecraft:scale': { value: 0.5 }, 'minecraft:is_baby': {} } },
    events: { 'minecraft:entity_born': { add: { component_groups: ['baby'] } } }
};

/** A runtime over the fixture with the extra types and Java's `#minecraft:climbable` cut down to the ladder. */
const runtimeWith = (extra: ExtraEntities, world = new TestEntityWorld()) =>
    entityFixture(
        world,
        {
            load: () => ({
                definitions: {
                    ...entityFixtureStack(extra),
                    tags: new Map([
                        [
                            'block/minecraft:climbable',
                            definitionOf('tags', 'block/minecraft:climbable', { values: ['minecraft:ladder'] })
                        ]
                    ])
                },
                diagnostics: []
            })
        },
        extra
    );

describe('a Java living body in the air', () => {
    it('moves by its velocity before gravity and drag apply', () => {
        const { runtime } = runtimeWith({ 'minecraft:pig': PIG });
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: 100, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');

        const drops: number[] = [];
        for (let tick = 1; tick <= 3; tick += 1) {
            const before = pig.position.y;
            runtime.tick(tick);
            drops.push(before - pig.position.y);
        }

        // LivingEntity.travelInAir: move(0), then (0 - 0.08) * 0.98, and so on.
        expect(drops[0]).toBeCloseTo(0, 9);
        expect(drops[1]).toBeCloseTo(0.0784, 9);
        expect(drops[2]).toBeCloseTo((0.0784 + 0.08) * 0.98, 9);
    });

    it('falls at 0.6 of the speed as a chicken, and as a fish out of water', () => {
        const fish = {
            components: {
                ...PIG.components,
                'minecraft:physics': { has_gravity: false },
                'minecraft:navigation.swim': {}
            }
        };
        const { runtime } = runtimeWith({ 'minecraft:chicken': PIG, 'minecraft:cod': fish });
        const fallOf = (identifier: string, x: number): number[] => {
            const mob = runtime.spawn(identifier, { x, y: 100, z: 0.5 });
            if (mob === undefined) throw new Error(`the fixture declares no ${identifier}`);
            const drops: number[] = [];
            for (let tick = 1; tick <= 3; tick += 1) {
                const before = mob.position.y;
                runtime.tick(tick);
                drops.push(before - mob.position.y);
            }
            runtime.remove(mob.id, 'test complete');
            return drops;
        };

        // Chicken.aiStep: (0 - 0.08) * 0.98 * 0.6 after the first move.
        expect(fallOf('minecraft:chicken', 0.5)[1]).toBeCloseTo(0.0784 * 0.6, 9);
        expect(fallOf('minecraft:cod', 20.5)[1]).toBeCloseTo(0.0784, 9);
    });

    it("gives a minecart Java's 0.04 gravity, which it applies before it moves", () => {
        const minecart = {
            components: { 'minecraft:physics': {}, 'minecraft:collision_box': { width: 0.98, height: 0.7 } }
        };
        const { runtime } = runtimeWith({ 'minecraft:minecart': minecart });
        const cart = runtime.spawn('minecraft:minecart', { x: 0.5, y: 100, z: 0.5 });
        if (cart === undefined) throw new Error('the fixture declares no minecart');
        runtime.tick(1);

        expect(100 - cart.position.y).toBeCloseTo(0.04, 9);
    });

    it("rises 1.2522 blocks on Java's 0.42 jump", () => {
        const { runtime } = runtimeWith({ 'minecraft:pig': PIG });
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');
        runtime.tick(1);

        pig.body.jump();
        let apex = GROUND;
        for (let tick = 2; tick <= 30; tick += 1) {
            runtime.tick(tick);
            apex = Math.max(apex, pig.position.y);
        }

        expect(apex - GROUND).toBeCloseTo(1.2522, 4);
    });

    it('slides down a ladder at 0.15 blocks a tick and no faster', () => {
        const world = new TestEntityWorld();
        for (let y = GROUND; y < GROUND + 10; y += 1) world.setBlock({ x: 0, y, z: 0 }, 'minecraft:ladder');
        const { runtime } = runtimeWith({ 'minecraft:pig': PIG }, world);
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND + 8, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');

        const drops: number[] = [];
        for (let tick = 1; tick <= 6; tick += 1) {
            const before = pig.position.y;
            runtime.tick(tick);
            drops.push(before - pig.position.y);
        }

        expect(Math.max(...drops)).toBeCloseTo(0.15, 9);
        expect(drops.at(-1)).toBeCloseTo(0.15, 9);
    });
});

describe('a body on the ground', () => {
    it("keeps Java's modified friction while it slides", () => {
        const { runtime } = runtimeWith({
            'minecraft:pig': {
                ...PIG,
                components: {
                    ...PIG.components,
                    'minecraft:friction_modifier': { value: 0.3 },
                    'minecraft:air_drag_modifier': { value: 0.01 }
                }
            }
        });
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');
        runtime.tick(1);

        pig.body.velocity = { x: 0.4, y: 0, z: 0 };
        runtime.tick(2);

        // computeModifiedFriction(0.6, 0.3) * computeModifiedFriction(0.91, 0.01), with stone's friction a float.
        expect(pig.body.velocity.x / 0.4).toBeCloseTo((1 - 0.4 * 0.3) * (1 - 0.09 * 0.01), 6);
    });

    it('walks at a quarter of its stride through a cobweb unless its type is immune to the web', () => {
        const spider = {
            ...PIG,
            components: {
                ...PIG.components,
                'minecraft:block_movement_slowdown_immunity': { blocks: ['minecraft:web'] }
            }
        };
        const strideOf = (identifier: string, web: boolean): number => {
            const world = new TestEntityWorld();
            if (web) for (let x = -1; x <= 8; x += 1) world.setBlock({ x, y: GROUND, z: 0 }, 'minecraft:web');
            const { runtime } = runtimeWith({ 'minecraft:pig': PIG, 'minecraft:spider': spider }, world);
            const mob = runtime.spawn(identifier, { x: 0.5, y: GROUND, z: 0.5 });
            if (mob === undefined) throw new Error(`the fixture declares no ${identifier}`);
            for (let tick = 1; tick <= 6; tick += 1) {
                mob.body.moveTo({ x: 8.5, y: GROUND, z: 0.5 }, 1);
                runtime.tick(tick);
            }
            return mob.position.x - 0.5;
        };

        expect(strideOf('minecraft:pig', true)).toBeLessThan(strideOf('minecraft:pig', false) * 0.3);
        expect(strideOf('minecraft:spider', true)).toBeCloseTo(strideOf('minecraft:spider', false), 9);
    });

    it("walks up a full block without jumping when Java's step height covers it", () => {
        const world = new TestEntityWorld();
        for (let x = 2; x <= 8; x += 1) world.setBlock({ x, y: GROUND, z: 0 }, 'minecraft:stone');
        const enderman = {
            ...PIG,
            components: { ...PIG.components, 'minecraft:collision_box': { width: 0.6, height: 2.9 } }
        };
        const { runtime } = runtimeWith({ 'minecraft:enderman': enderman, 'minecraft:pig': PIG }, world);
        const walk = (identifier: string) => {
            const mob = runtime.spawn(identifier, { x: 0.5, y: GROUND, z: 0.5 });
            if (mob === undefined) throw new Error(`the fixture declares no ${identifier}`);
            let jumped = false;
            for (let tick = 1; tick <= 60 && mob.position.y < GROUND + 1; tick += 1) {
                mob.body.moveTo({ x: 5.5, y: GROUND + 1, z: 0.5 }, 1);
                runtime.tick(tick);
                if (mob.body.velocity.y > 0) jumped = true;
            }
            runtime.remove(mob.id, 'test complete');
            return { climbed: mob.position.y >= GROUND + 1, jumped };
        };

        // Java's enderman steps 1 block; the pig's 0.6 makes it jump.
        expect(walk('minecraft:enderman')).toEqual({ climbed: true, jumped: false });
        expect(walk('minecraft:pig')).toEqual({ climbed: true, jumped: true });
    });
});

describe('a scaled body', () => {
    it("is its box times the active scale, as a baby's is", () => {
        const { runtime } = runtimeWith({ 'minecraft:pig': PIG });
        const adult = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        const baby = runtime.spawn('minecraft:pig', { x: 4.5, y: GROUND, z: 0.5 }, { event: 'minecraft:entity_born' });

        expect(adult?.facts.box).toEqual({ width: 0.9, height: 0.9 });
        expect(baby?.facts.box).toEqual({ width: 0.45, height: 0.45 });
    });
});

describe('pushing', () => {
    it('pushes a boat, but not another body that is no living entity even when Bedrock marks it pushable', () => {
        const boat = {
            components: {
                'minecraft:physics': {},
                'minecraft:pushable_by_entity': {},
                'minecraft:type_family': { family: ['boat', 'inanimate'] },
                'minecraft:collision_box': { width: 1.4, height: 0.455 }
            }
        };
        const crystal = {
            components: {
                'minecraft:physics': {},
                'minecraft:health': { value: 1, max: 1 },
                'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true }
            }
        };
        const { runtime } = runtimeWith({
            'minecraft:pig': PIG,
            'minecraft:boat': boat,
            'minecraft:ender_crystal': crystal
        });
        const pushedBy = (identifier: string, x: number): number => {
            const body = runtime.spawn(identifier, { x: x + 0.5, y: GROUND, z: 0.5 });
            const pig = runtime.spawn('minecraft:pig', { x: x + 0.75, y: GROUND, z: 0.5 });
            if (body === undefined || pig === undefined) throw new Error('the fixture refused a spawn');
            runtime.tick(1);
            return body.body.velocity.x;
        };

        // Java's AbstractBoat.isPushable is true; Entity.isPushable, which the end crystal keeps, is false.
        expect(pushedBy('minecraft:boat', 0)).toBeLessThan(0);
        expect(pushedBy('minecraft:ender_crystal', 20)).toBe(0);
    });
});

describe('a piston', () => {
    it('carries a body one block along, and no further than the blocks let it', () => {
        const world = new TestEntityWorld();
        world.setBlock({ x: 5, y: GROUND, z: 0 }, 'minecraft:stone');
        const { runtime } = runtimeWith({ 'minecraft:pig': PIG }, world);
        const free = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        const walled = runtime.spawn('minecraft:pig', { x: 4.5, y: GROUND, z: 0.5 });
        if (free === undefined || walled === undefined) throw new Error('the fixture declares no pig');

        runtime.carry(free.id, { x: 1, y: 0, z: 0 });
        runtime.carry(walled.id, { x: 1, y: 0, z: 0 });

        expect(free.position.x).toBeCloseTo(1.5, 9);
        expect(walled.position.x).toBeLessThan(5 - 0.45 + 1e-6);
    });
});

describe('a boat', () => {
    it('lands on the surface of water it falls onto and stays there', () => {
        const world = new TestEntityWorld();
        for (let y = GROUND; y < GROUND + 4; y += 1)
            for (let x = -2; x <= 2; x += 1)
                for (let z = -2; z <= 2; z += 1)
                    world.world.blocks.set(
                        { x, y, z },
                        { identifier: 'minecraft:water', states: { liquid_depth: 0 } },
                        false
                    );
        const boat = {
            components: {
                'minecraft:physics': {},
                'minecraft:type_family': { family: ['boat', 'inanimate'] },
                'minecraft:collision_box': { width: 1.4, height: 0.455 },
                'minecraft:buoyant': { base_buoyancy: 1, liquid_blocks: ['minecraft:water', 'minecraft:flowing_water'] }
            }
        };
        const { runtime } = runtimeWith({ 'minecraft:boat': boat }, world);
        const entity = runtime.spawn('minecraft:boat', { x: 0.5, y: GROUND + 4.5, z: 0.5 });
        if (entity === undefined) throw new Error('the fixture declares no boat');

        let lowest = Number.POSITIVE_INFINITY;
        for (let tick = 1; tick <= 80; tick += 1) {
            runtime.tick(tick);
            if (tick > 40) lowest = Math.min(lowest, entity.position.y);
        }

        // AbstractBoat.floatBoat sets a boat coming out of the air at the water level, less its height, plus 0.101.
        expect(lowest + 0.455).toBeGreaterThan(GROUND + 4);
    });
});

/** A fixture with a pool of `fluid` with no collision, as the pack's fluid blocks have none, `depth` blocks deep over the floor. */
const fluidWorld = (extra: ExtraEntities, fluid = 'minecraft:water', depth = 3) => {
    const world = new TestEntityWorld();
    for (let x = -1; x <= 12; x += 1)
        for (let z = -1; z <= 1; z += 1)
            for (let y = GROUND; y < GROUND + depth; y += 1)
                world.world.blocks.set({ x, y, z }, { identifier: fluid, states: {} }, false);
    const stack = entityFixtureStack(extra);
    const block = definitionOf('blocks', fluid, {
        format_version: '1.26.20',
        'minecraft:block': {
            description: { identifier: fluid },
            components: { 'minecraft:collision_box': false, 'minecraft:light_dampening': 0 }
        }
    });
    return entityFixture(
        world,
        {
            load: () => ({
                definitions: { ...stack, blocks: new Map([...stack.blocks, [fluid, block]]) },
                diagnostics: []
            })
        },
        extra
    );
};

describe('a strider', () => {
    const STRIDER = {
        components: {
            'minecraft:health': { value: 20, max: 20 },
            'minecraft:movement': { value: 0.175 },
            'minecraft:physics': {},
            'minecraft:collision_box': { width: 0.9, height: 1.7 },
            'minecraft:navigation.walk': { can_walk_in_lava: true, can_sink: false }
        }
    };

    it("stands on a lava pool's surface half a block into its top block", () => {
        const { runtime } = fluidWorld({ 'minecraft:strider': STRIDER }, 'minecraft:lava', 1);
        const strider = runtime.spawn('minecraft:strider', { x: 0.5, y: GROUND + 2, z: 0.5 });
        if (strider === undefined) throw new Error('the fixture declares no strider');
        for (let tick = 1; tick <= 40; tick += 1) runtime.tick(tick);

        expect(strider.position.y).toBe(GROUND + 0.5);
    });

    it('floats up out of deep lava by 0.05 blocks a tick until it reaches the surface', () => {
        const { runtime } = fluidWorld({ 'minecraft:strider': STRIDER }, 'minecraft:lava', 3);
        const strider = runtime.spawn('minecraft:strider', { x: 0.5, y: GROUND, z: 0.5 });
        if (strider === undefined) throw new Error('the fixture declares no strider');
        runtime.tick(1);
        expect(strider.position.y).toBeGreaterThan(GROUND);

        for (let tick = 2; tick <= 200; tick += 1) runtime.tick(tick);
        expect(strider.position.y).toBe(GROUND + 2.5);
    });
});

describe('a mob in water', () => {
    /** A mob that swims at a plain 0.1 blocks a tick and has no gravity to sink it. */
    const SWIMMER = {
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:movement': { value: 0.1 },
            'minecraft:underwater_movement': { value: 0.1 },
            'minecraft:physics': { has_gravity: false },
            'minecraft:collision_box': { width: 0.6, height: 0.6 },
            'minecraft:navigation.walk': {}
        }
    };

    /** The share of its last tick's swim a mob covers on the tick after the swim stops. */
    const kept = (identifier: string): number => {
        const { runtime } = fluidWorld({ [identifier]: SWIMMER });
        const mob = runtime.spawn(identifier, { x: 0.5, y: GROUND + 0.5, z: 0.5 });
        if (mob === undefined) throw new Error(`the fixture declares no ${identifier}`);
        mob.body.yaw = -90;
        mob.body.moveTo({ x: 10.5, y: GROUND + 0.5, z: 0.5 }, 1);
        let last = 0;
        for (let tick = 1; tick <= 4; tick += 1) {
            const before = mob.position.x;
            runtime.tick(tick);
            last = mob.position.x - before;
        }
        mob.body.stopMoving();
        const before = mob.position.x;
        runtime.tick(5);
        return (mob.position.x - before) / last;
    };

    it("drifts on once its swim stops, keeping the share of its speed Java's water drag keeps", () => {
        // LivingEntity.getWaterSlowDown, a swimmer's own travel, and PolarBear.getWaterSlowDown.
        expect(kept('jsprismarine:wader')).toBeCloseTo(0.8, 6);
        expect(kept('minecraft:cod')).toBeCloseTo(0.9, 6);
        expect(kept('minecraft:polar_bear')).toBeCloseTo(0.98, 6);
    });
});
