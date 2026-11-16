import { describe, expect, it } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
import type { ExtraEntities } from './testing';
import { entityFixture, entityFixtureStack, FLOOR_Y, TestEntityWorld } from './testing';

const FEET = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

const DEFINITIONS: ExtraEntities = {
    'minecraft:snow_golem': {
        components: {
            'minecraft:health': { value: 4, max: 4 },
            'minecraft:collision_box': { width: 0.7, height: 1.9 },
            'minecraft:trail': { block_type: 'minecraft:snow_layer' }
        }
    },
    'minecraft:ravager': {
        components: {
            'minecraft:health': { value: 100, max: 100 },
            'minecraft:collision_box': { width: 1.95, height: 2.2 },
            'minecraft:break_blocks': { breakable_blocks: ['oak_leaves', 'melon_block'] }
        }
    },
    'minecraft:breeze': {
        components: {
            'minecraft:health': { value: 30, max: 30 },
            'minecraft:collision_box': { width: 0.6, height: 1.77 },
            'minecraft:physics': { has_gravity: false }
        }
    },
    'jsprismarine:arrow': {
        components: {
            'minecraft:collision_box': { width: 0.25, height: 0.25 },
            'minecraft:physics': { has_gravity: false },
            'minecraft:projectile': { on_hit: { impact_damage: { damage: 2 } } }
        }
    }
};

/** A runtime over the fixture with Java's leaves and `deflects_projectiles` tags cut down to what the tests use. */
const runtimeWith = (world: TestEntityWorld) =>
    entityFixture(
        world,
        {
            load: () => ({
                definitions: {
                    ...entityFixtureStack(DEFINITIONS),
                    tags: new Map([
                        [
                            'block/minecraft:leaves',
                            definitionOf('tags', 'block/minecraft:leaves', { values: ['minecraft:oak_leaves'] })
                        ],
                        [
                            'entity_type/minecraft:deflects_projectiles',
                            definitionOf('tags', 'entity_type/minecraft:deflects_projectiles', {
                                values: ['minecraft:breeze']
                            })
                        ]
                    ])
                },
                diagnostics: []
            })
        },
        DEFINITIONS
    );

describe('a snow golem', () => {
    it('leaves snow in the air it stands in', () => {
        const world = new TestEntityWorld();
        const { runtime } = runtimeWith(world);
        runtime.spawn('minecraft:snow_golem', FEET);
        runtime.tick(1);
        expect(world.world.blocks.get({ x: 0, y: FLOOR_Y + 1, z: 0 })?.identifier).toBe('minecraft:snow_layer');
        expect(world.gameEvents.map((event) => event.event)).toContain('minecraft:block_place');
    });

    it('leaves no snow with mobGriefing off', () => {
        const world = new TestEntityWorld({ gameRules: { mobGriefing: false } });
        const { runtime } = runtimeWith(world);
        runtime.spawn('minecraft:snow_golem', FEET);
        runtime.tick(1);
        expect(world.world.blocks.get({ x: 0, y: FLOOR_Y + 1, z: 0 })?.identifier).not.toBe('minecraft:snow_layer');
    });
});

describe('a ravager', () => {
    /** Pushes a ravager into a wall of one block for some ticks and answers whether the wall still stands. */
    const wallStands = (block: string): boolean => {
        const world = new TestEntityWorld();
        const { runtime } = runtimeWith(world);
        const wall = { x: 3, y: FLOOR_Y + 1, z: 0 };
        for (const dz of [-1, 0, 1])
            for (const dy of [0, 1, 2]) world.setBlock({ x: wall.x, y: wall.y + dy, z: dz }, block);
        const ravager = runtime.spawn('minecraft:ravager', FEET);
        if (ravager === undefined) throw new Error('the fixture spawned no ravager');
        for (let tick = 1; tick <= 20; tick += 1) {
            ravager.body.velocity = { ...ravager.body.velocity, x: 0.3 };
            runtime.tick(tick);
        }
        return world.world.blocks.get(wall)?.identifier === block;
    };

    it('breaks the leaves it walks into', () => {
        expect(wallStands('minecraft:oak_leaves')).toBe(false);
    });

    it('breaks no other block, whatever the pack lists', () => {
        expect(wallStands('minecraft:melon_block')).toBe(true);
    });
});

describe('a breeze', () => {
    it('turns an arrow back unharmed', () => {
        const world = new TestEntityWorld();
        const { runtime } = runtimeWith(world);
        const breeze = runtime.spawn('minecraft:breeze', FEET);
        const arrow = runtime.spawn('jsprismarine:arrow', { ...FEET, x: FEET.x - 3, y: FEET.y + 1 });
        if (breeze === undefined || arrow === undefined) throw new Error('the fixture spawned no breeze or arrow');
        arrow.body.velocity = { x: 1.5, y: 0, z: 0 };
        for (let tick = 1; tick <= 4; tick += 1) runtime.tick(tick);
        expect(breeze.instance.attributes.value('health')).toBe(30);
        expect(arrow.body.velocity.x).toBeLessThan(0);
    });
});
