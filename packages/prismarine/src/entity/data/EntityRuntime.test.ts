import { describe, expect, it } from 'vitest';

import { Activities } from '@jsprismarine/entity-brains';

import { brainEntityOf, brainMobOf, tickBrainNavigation } from './brainWorld';
import { dataEntityRecordOf } from './persistence';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** A runtime over the entity fixture, with the world a test can poke at. */
const runtimeOf = (world = new TestEntityWorld()) => entityFixture(world);

const brainGoatRuntime = (navigation: 'walk' | 'fly', world = new TestEntityWorld()) =>
    entityFixture(
        world,
        {},
        {
            'minecraft:goat': {
                components: {
                    'minecraft:health': { value: 10, max: 10 },
                    'minecraft:movement': { value: 2 },
                    'minecraft:collision_box': { width: 0.9, height: 1.3 },
                    [`minecraft:navigation.${navigation}`]: {}
                }
            }
        }
    );

const moverRuntime = (world = new TestEntityWorld()) =>
    entityFixture(
        world,
        {},
        {
            'jsprismarine:mover': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:movement': { value: 0.25 },
                    'minecraft:collision_box': { width: 0.6, height: 1.8 },
                    'minecraft:physics': {},
                    'minecraft:navigation.walk': { can_walk: true },
                    'minecraft:jump.static': { jump_power: 0.8 }
                }
            }
        }
    );

const GROUND = { x: 0, y: FLOOR_Y + 1, z: 0 };

describe('EntityRuntime', () => {
    describe('entity facts', () => {
        it('reads a type’s stats off its definition rather than off a table', () => {
            const { runtime } = runtimeOf();
            const cow = runtime.typeFacts().get('minecraft:cow');

            expect(cow).toMatchObject({
                identifier: 'minecraft:cow',
                box: { width: 0.9, height: 1.3 },
                health: 10,
                attackDamage: 2,
                knockbackResistance: 0.25,
                followRange: 24,
                families: ['cow', 'mob'],
                lootTable: 'loot_tables/entities/cow.json'
            });
        });

        it('has no facts at all for a type no pack declared', () => {
            const { runtime } = runtimeOf();

            expect(runtime.typeFacts().get('minecraft:wither')).toBeUndefined();
        });
    });

    describe('spawning', () => {
        it('runs the spawn event for the cause, and only that one', () => {
            const { runtime } = runtimeOf();

            const spawned = runtime.spawn('jsprismarine:hatchling', GROUND);
            const born = runtime.spawn('jsprismarine:hatchling', GROUND, { cause: 'born' });

            expect(spawned?.instance.activeComponentGroups()).toEqual(['hatched']);
            expect(born?.instance.activeComponentGroups()).toEqual(['grown']);
        });

        it('replaces the built-in spawn event with the one the caller names', () => {
            const { runtime } = runtimeOf();

            const named = runtime.spawn('jsprismarine:hatchling', GROUND, { event: 'jsprismarine:named_spawn' });

            expect(named?.instance.activeComponentGroups()).toEqual(['grown', 'hatched']);
        });

        it('applies what the spawn event did to the entity’s own state', () => {
            const { runtime } = runtimeOf();

            const born = runtime.spawn('jsprismarine:hatchling', GROUND, { cause: 'born' });

            // The `grown` group replaces the base `minecraft:health`, which is the whole point
            // of a component group being a state machine rather than a patch.
            expect(born?.instance.attributes.get('health')?.max).toBe(12);
        });

        it('refuses a type the content declares nothing for, and says so', () => {
            const { runtime, reports } = runtimeOf();

            expect(runtime.spawn('minecraft:wither', GROUND)).toBeUndefined();
            expect(reports.join('\n')).toContain('minecraft:wither');
        });

        it('gives every entity a runtime id of its own', () => {
            const { runtime } = runtimeOf();

            const first = runtime.spawn('minecraft:cow', GROUND);
            const second = runtime.spawn('minecraft:cow', GROUND);

            expect(first?.id).not.toBe(second?.id);
            expect(runtime.all()).toHaveLength(2);
        });

        it('announces each entity once its spawn event has run', () => {
            const { runtime, spawned } = runtimeOf();

            runtime.spawn('jsprismarine:hatchling', GROUND);

            expect(spawned).toHaveLength(1);
            expect(spawned[0]?.instance.activeComponentGroups()).toEqual(['hatched']);
        });

        it('announces each removal with the reason it was given', () => {
            const { runtime, removed } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.remove(cow!.id, 'despawn');

            expect(removed).toEqual([{ entity: cow, reason: 'despawn' }]);
        });
    });

    describe('physics', () => {
        it('floats a vanilla-shaped buoyant entity at the water surface', () => {
            const { runtime, world } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:buoyant': {
                        components: {
                            'minecraft:collision_box': { width: 1.4, height: 0.455 },
                            'minecraft:physics': {},
                            'minecraft:buoyant': { liquid_blocks: ['minecraft:water', 'minecraft:flowing_water'] }
                        }
                    }
                }
            );
            for (let x = -1; x <= 1; x += 1) {
                for (let z = -1; z <= 1; z += 1) world.setBlock({ x, y: FLOOR_Y + 1, z }, 'minecraft:water');
            }
            const boat = runtime.spawn('jsprismarine:buoyant', { x: 0.5, y: FLOOR_Y + 1.7, z: 0.5 });
            if (boat === undefined) throw new Error('the fixture declares no buoyant entity');

            for (let tick = 1; tick <= 200; tick += 1) runtime.tick(tick);

            expect(boat.body.conditions.has('in_water')).toBe(true);
            expect(boat.position.y).toBeGreaterThan(FLOOR_Y + 1.6);
            expect(boat.position.y).toBeLessThan(FLOOR_Y + 1.8);
        });

        it('keeps a walking entity from following a path vertically into the air', () => {
            const { runtime } = moverRuntime();
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            mover.body.moveTo({ x: 0.5, y: GROUND.y + 4, z: 0.5 }, 1);

            runtime.tick(1);

            expect(mover.position.y).toBe(GROUND.y);
        });

        it('stops a walking entity at the collision box of a solid wall', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 2, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 1, y: FLOOR_Y + 2, z: 0 }, 'minecraft:stone');
            const { runtime } = moverRuntime(world);
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            mover.body.moveTo({ x: 3.5, y: GROUND.y, z: 0.5 }, 1);

            for (let tick = 1; tick <= 10; tick += 1) runtime.tick(tick);

            expect(mover.position.x).toBeLessThan(1);
        });

        it('jumps onto a one-block step instead of moving upward through it', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 2, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            const { runtime } = moverRuntime(world);
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            mover.body.moveTo({ x: 2.5, y: GROUND.y + 1, z: 0.5 }, 1);

            for (let tick = 1; tick <= 40; tick += 1) runtime.tick(tick);

            expect(mover.position.x).toBeGreaterThan(1.5);
            expect(mover.position.y).toBe(GROUND.y + 1);
        });

        it('uses the active jump component when the entity actuator jumps', () => {
            const { runtime } = moverRuntime();
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            runtime.tick(1);

            mover.instance.actuator?.jump();

            expect(mover.body.velocity.y).toBe(0.8);
        });

        it('lets a zombie and villager fall onto solid ground and run their AI', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld({ dayTime: 2000, random: [0.61, 0.5, 0.5] }),
                {},
                {
                    'minecraft:zombie': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 2 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:physics': {},
                            'minecraft:navigation.walk': {},
                            'minecraft:type_family': { family: ['zombie', 'monster', 'mob'] },
                            'minecraft:behavior.random_stroll': {
                                priority: 6,
                                interval: 1,
                                speed_multiplier: 1,
                                xz_dist: 5,
                                y_dist: 1
                            }
                        }
                    },
                    'minecraft:villager_v2': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 2 },
                            'minecraft:collision_box': { width: 0.6, height: 1.9 },
                            'minecraft:physics': {},
                            'minecraft:navigation.walk': {}
                        }
                    }
                }
            );
            const zombieStart = { ...GROUND, y: GROUND.y + 0.5 };
            const villagerStart = { ...zombieStart, x: 5.5 };
            const previouslySpawnedZombie = runtime.spawn('minecraft:zombie', zombieStart);
            if (previouslySpawnedZombie === undefined) throw new Error('the fixture declares no minecraft:zombie');
            const savedZombie = dataEntityRecordOf(previouslySpawnedZombie, undefined);
            runtime.remove(previouslySpawnedZombie.id, 'test restore');
            const zombie = runtime.restore(savedZombie, zombieStart);
            if (zombie === undefined) throw new Error('the fixture could not restore minecraft:zombie');
            const villager = runtime.spawn('minecraft:villager_v2', villagerStart);

            for (let tick = 1; tick <= 200; tick += 1) runtime.tick(tick);

            expect(zombie?.position.y).toBe(GROUND.y);
            expect(villager?.position.y).toBe(GROUND.y);
            expect(zombie?.position).not.toMatchObject({ x: zombieStart.x, z: zombieStart.z });
            expect(villager?.position).not.toMatchObject({ x: villagerStart.x, z: villagerStart.z });
        });

        it('respects entity data that disables gravity', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:buoyant': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:physics': { has_gravity: false }
                        }
                    }
                }
            );
            const spawnPosition = { ...GROUND, y: GROUND.y + 0.5 };
            const buoyant = runtime.spawn('jsprismarine:buoyant', spawnPosition);

            for (let tick = 1; tick <= 10; tick += 1) runtime.tick(tick);

            expect(buoyant?.position.y).toBe(spawnPosition.y);
        });
    });

    describe('player targeting', () => {
        it('updates brain combat targetability immediately when a player changes game mode', () => {
            const player = {
                id: 99,
                identifier: 'minecraft:player',
                position: { x: 2.5, y: FLOOR_Y + 1, z: 0.5 },
                creative: false,
                spectator: false
            };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = entityFixture(world);
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const brainWorld = runtime.brainWorld();
            const brainBody = brainEntityOf(cow, runtime);
            const brainPlayer = brainWorld.players()[0];
            if (brainPlayer === undefined) throw new Error('the test world has no player');

            expect(brainWorld.isAttackable(brainBody, brainPlayer)).toBe(true);

            world.players = [{ ...player, creative: true }];

            expect(brainWorld.isTargetable(brainBody, brainPlayer)).toBe(true);
            expect(brainWorld.isAttackable(brainBody, brainPlayer)).toBe(false);
        });

        it('ignores creative players and drops a target when a player switches to creative', () => {
            const player = {
                id: 99,
                identifier: 'minecraft:player',
                position: { x: 8.5, y: FLOOR_Y + 1, z: 0.5 },
                creative: true,
                spectator: false
            };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = entityFixture(
                world,
                {},
                {
                    'minecraft:zombie': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 1 },
                            'minecraft:follow_range': { value: 24 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:physics': {},
                            'minecraft:navigation.walk': {},
                            'minecraft:type_family': { family: ['zombie', 'monster', 'mob'] },
                            'minecraft:behavior.nearest_attackable_target': {
                                priority: 1,
                                within_radius: 24,
                                entity_types: [
                                    { filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 24 }
                                ]
                            }
                        }
                    }
                }
            );
            const zombie = runtime.spawn('minecraft:zombie', GROUND);

            for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);
            expect(zombie?.target).toBeUndefined();

            world.players = [{ ...player, creative: false }];
            for (let tick = 21; tick <= 40; tick += 1) runtime.tick(tick);
            expect(zombie?.target).toBe(player.id);

            world.players = [player];
            runtime.tick(41);
            expect(zombie?.target).toBeUndefined();
        });
    });

    describe('combat', () => {
        it('sends a blow at a player out through the host', () => {
            const player = { id: 99, identifier: 'minecraft:player', position: { x: 1, y: FLOOR_Y + 1, z: 0 } };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.attack(cow!.body, runtime.mobById(99)!);

            expect(world.hits).toEqual([{ id: 99, amount: 2, cause: 'entity_attack', sourceId: cow!.id }]);
        });

        it('takes health off an entity this index does hold', () => {
            const { runtime } = runtimeOf();

            const attacker = runtime.spawn('minecraft:cow', GROUND);
            const victim = runtime.spawn('minecraft:cow', GROUND);
            runtime.attack(attacker!.body, runtime.mobById(victim!.id)!);

            expect(victim!.instance.attributes.get('health')?.current).toBe(8);
            expect(victim!.body.damage.last()?.sourceId).toBe(attacker!.id);
        });
    });

    describe('the goal scheduler', () => {
        it('gives a contested control flag to the better priority', () => {
            const world = new TestEntityWorld({
                players: [{ id: 99, identifier: 'minecraft:player', position: { x: 2, y: FLOOR_Y + 1, z: 0 } }]
            });
            const { runtime } = runtimeOf(world);

            const wanderer = runtime.spawn('jsprismarine:wanderer', GROUND);
            runtime.tick(1);

            // `look_at_player` is priority 2 and `random_stroll` is priority 6; both were
            // forced onto the move flag, and 0 is the highest priority.
            expect(wanderer?.instance.goals.names()).toEqual([
                'minecraft:behavior.look_at_player',
                'minecraft:behavior.random_stroll'
            ]);
            expect(wanderer?.instance.goals.holderOf('move')).toBe('minecraft:behavior.look_at_player');
        });

        it('walks the entity to where the running goal sent it', () => {
            // No players, so `look_at_player` cannot start and the stroll takes the move flag.
            const world = new TestEntityWorld({ random: [0.95, 0.5, 0.5, 0.1] });
            const { runtime } = runtimeOf(world);

            const wanderer = runtime.spawn('jsprismarine:wanderer', GROUND);
            const before = { ...(wanderer?.position ?? GROUND) };
            for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);

            expect(wanderer?.instance.goals.holderOf('move')).toBe('minecraft:behavior.random_stroll');
            expect(wanderer?.position).not.toEqual(before);
        });

        it('runs no goals for an entity whose definition declares none', () => {
            const { runtime } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.tick(1);

            expect(cow?.instance.goals.names()).toEqual([]);
        });
    });

    describe('brains', () => {
        it('runs a brain mob’s brain and reaches an activity', () => {
            const { runtime } = runtimeOf();

            const goat = runtime.spawn('minecraft:goat', GROUND);
            runtime.tick(1);

            expect(goat?.brainMob?.id).toBe('minecraft:goat');
            expect(goat?.brain?.isActive(Activities.IDLE)).toBe(true);
        });

        it('leaves a goal-only entity without a brain', () => {
            const { runtime } = runtimeOf();

            expect(runtime.spawn('minecraft:cow', GROUND)?.brain).toBeUndefined();
        });

        it('runs the goal scheduler for everything that is not a brain mob', () => {
            const { runtime } = runtimeOf();

            expect(runtime.spawn('minecraft:cow', GROUND)?.runsGoals).toBe(true);
            expect(runtime.spawn('minecraft:goat', GROUND)?.runsGoals).toBe(false);
        });

        it('routes a walking brain mob around solid blocks', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 1, y: FLOOR_Y + 2, z: 0 }, 'minecraft:stone');
            const { runtime } = brainGoatRuntime('walk', world);
            const goat = runtime.spawn('minecraft:goat', GROUND);
            if (goat?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:goat');

            const mob = brainMobOf(goat, goat.brain, runtime);
            const target = { x: 2.5, y: FLOOR_Y + 1, z: 0.5 };
            expect(mob.navigation.moveTo(target, 1)).toBe(true);
            for (let tick = 0; tick < 30; tick += 1) {
                expect(mob.navigation.moveTo(target, 1)).toBe(true);
                tickBrainNavigation(goat);
                goat.body.step();
                expect(Math.floor(goat.position.x) === 1 && Math.floor(goat.position.z) === 0).toBe(false);
            }
        });

        it('does not let a walking brain mob fly to a position without ground support', () => {
            const { runtime } = brainGoatRuntime('walk');
            const goat = runtime.spawn('minecraft:goat', GROUND);
            if (goat?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:goat');

            const mob = brainMobOf(goat, goat.brain, runtime);
            const target = { x: 0.5, y: FLOOR_Y + 5, z: 0.5 };
            expect(mob.navigation.canReach(target)).toBe(false);
            expect(mob.navigation.moveTo(target, 1)).toBe(false);
            for (let tick = 0; tick < 30; tick += 1) goat.body.step();

            expect(goat.position.y).toBe(GROUND.y);
        });

        it('lets a brain mob fly when its navigation component allows it', () => {
            const { runtime } = brainGoatRuntime('fly');
            const goat = runtime.spawn('minecraft:goat', GROUND);
            if (goat?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:goat');

            const mob = brainMobOf(goat, goat.brain, runtime);
            const target = { x: 0.5, y: FLOOR_Y + 5, z: 0.5 };
            expect(mob.navigation.moveTo(target, 1)).toBe(true);
            for (let tick = 0; tick < 10; tick += 1) {
                expect(mob.navigation.moveTo(target, 1)).toBe(true);
                tickBrainNavigation(goat);
                goat.body.step();
            }

            expect(goat.position.y).toBeGreaterThan(GROUND.y);
        });
    });

    describe('death', () => {
        it('drops what the entity’s own loot table rolls', () => {
            const world = new TestEntityWorld();
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.kill(cow!);

            expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:leather']);
            expect(runtime.all()).toHaveLength(0);
        });

        it('rolls nothing with doMobLoot off, and still takes the entity', () => {
            const world = new TestEntityWorld({ gameRules: { doMobLoot: false } });
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.kill(cow!);

            expect(world.drops).toHaveLength(0);
            expect(runtime.all()).toHaveLength(0);
        });
    });

    describe('counting', () => {
        it('counts entities of one type within a radius', () => {
            const { runtime } = runtimeOf();

            runtime.spawn('minecraft:cow', GROUND);
            runtime.spawn('minecraft:cow', { x: 20, y: FLOOR_Y + 1, z: 0 });

            expect(runtime.countOfType('minecraft:cow', GROUND, 5)).toBe(1);
            expect(runtime.countOfType('minecraft:cow', GROUND, 30)).toBe(2);
        });

        it('counts a population pool only while its entities are alive', () => {
            const { runtime } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND, { pool: 'animal' });
            expect(runtime.poolCount('animal')).toBe(1);

            runtime.remove(cow!.id, 'despawn');
            expect(runtime.poolCount('animal')).toBe(0);
        });
    });
});
