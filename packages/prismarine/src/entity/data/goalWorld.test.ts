import { describe, expect, it } from 'vitest';

import type { EntityPosition } from '@jsprismarine/entities';

import type { DataEntity } from './DataEntity';
import { goalWorldOf } from './goalWorld';
import type { EntityFixture, ExtraEntities } from './testing';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/**
 * The goal world against the real runtime.
 *
 * Every test here spawns real entities from real definitions and runs the
 * real scheduler. The assertions are about what happened to the world, not
 * about what the seam returned: the breeding test looks for a baby, the
 * riding test looks for a rider, the archery test looks for an arrow.
 */

/** The cell above the fixture's stone floor, which is where everything stands. */
const groundAt = (x: number, z: number): EntityPosition => ({ x, y: FLOOR_Y + 1, z });

/** The components every fixture mob needs to stand up and walk. */
const mobBase = {
    'minecraft:health': { value: 20, max: 20 },
    'minecraft:attack': { damage: 3 },
    'minecraft:movement': { value: 10 },
    'minecraft:follow_range': { value: 24 },
    'minecraft:collision_box': { width: 0.6, height: 1.8 },
    'minecraft:physics': {},
    'minecraft:navigation.walk': { can_walk: true },
    'minecraft:type_family': { family: ['mob'] }
};

/** One entity file with the standing components already on it. */
const mob = (components: Record<string, unknown>, rest: Record<string, unknown> = {}) => ({
    components: { ...mobBase, ...components },
    ...rest
});

/** The entity types the goal world tests declare, one per capability under test. */
const GOAL_WORLD_ENTITIES: ExtraEntities = {
    'jsprismarine:breeder': mob(
        {
            'minecraft:breedable': { require_tame: false, breed_items: ['minecraft:wheat'], breed_cooldown: 30 },
            'minecraft:behavior.breed': { priority: 1, speed_multiplier: 1 }
        },
        {
            component_groups: { baby: { 'minecraft:is_baby': {} } },
            events: { 'minecraft:entity_born': { add: { component_groups: ['baby'] } } }
        }
    ),
    'jsprismarine:archer': mob({
        'minecraft:shooter': { def: 'jsprismarine:dart' },
        'minecraft:behavior.ranged_attack': { priority: 1, attack_radius: 16, attack_interval: 0.05 }
    }),
    'jsprismarine:dart': {
        components: {
            'minecraft:health': { value: 1, max: 1 },
            'minecraft:projectile': {}
        }
    },
    'jsprismarine:mount': mob({
        'minecraft:rideable': { seat_count: 2, seats: { position: [0, 1, 0] } },
        'minecraft:behavior.controlled_by_player': { priority: 1 }
    }),
    'jsprismarine:rider': mob({
        'minecraft:behavior.find_mount': { priority: 1, within_radius: 16, mount_distance: 4 }
    }),
    'jsprismarine:pet': mob({
        'minecraft:behavior.follow_owner': { priority: 1, start_distance: 2, stop_distance: 1 },
        'minecraft:behavior.hurt_by_target': { priority: 0 }
    }),
    'jsprismarine:avenger': mob({ 'minecraft:behavior.owner_hurt_target': { priority: 0 } }),
    'jsprismarine:collector': mob({
        'minecraft:inventory': { inventory_size: 5 },
        'minecraft:behavior.pickup_items': { priority: 1, max_dist: 8, goal_radius: 2, can_pickup_any_item: true }
    }),
    'jsprismarine:giver': mob({
        'minecraft:inventory': { inventory_size: 5 },
        'minecraft:behavior.share_items': {
            priority: 1,
            max_dist: 8,
            goal_radius: 2,
            entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'mob' }, max_dist: 8 }]
        }
    }),
    'jsprismarine:sleeper': mob({ 'minecraft:behavior.sleep': { priority: 1, speed_multiplier: 1 } }),
    'jsprismarine:lounger': mob({
        'minecraft:behavior.lay_down': { priority: 1, interval: 1, random_stop_interval: 0 }
    }),
    'jsprismarine:thief': mob({
        'minecraft:behavior.take_block': {
            priority: 1,
            chance: 1,
            blocks: ['minecraft:redstone_lamp'],
            xz_range: [0, 6],
            y_range: [0, 2]
        }
    }),
    'jsprismarine:leaper': mob({
        'minecraft:behavior.leap_at_target': { priority: 1, yd: 0.5, must_be_on_ground: true }
    }),
    'jsprismarine:bruiser': mob({
        'minecraft:behavior.target_when_pushed': { priority: 0, percent_chance: 100 }
    }),
    'jsprismarine:coward': mob({ 'minecraft:behavior.panic': { priority: 1, speed_multiplier: 1.25 } }),
    'jsprismarine:shopkeeper': mob({
        'minecraft:economy_trade_table': {
            table: 'trading/economy_trades/farmer_trades.json',
            display_name: 'entity.villager.farmer'
        },
        'minecraft:behavior.trade_with_player': { priority: 1 },
        'minecraft:behavior.look_at_trading_player': { priority: 2 }
    }),
    'jsprismarine:bomber': mob({ 'minecraft:explode': { power: 3 } }),
    'jsprismarine:stalker': mob({
        'minecraft:behavior.nearest_attackable_target': {
            priority: 1,
            within_radius: 24,
            reselect_targets: true,
            entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 24 }]
        },
        'minecraft:behavior.melee_box_attack': { priority: 2, speed_multiplier: 1, track_target: true }
    })
};

/** A fixture carrying the goal world's entity types. */
const fixtureOf = (world = new TestEntityWorld()): EntityFixture => entityFixture(world, {}, GOAL_WORLD_ENTITIES);

/** Spawns one entity and fails the test when the content declares no such type. */
const spawned = (fixture: EntityFixture, identifier: string, at: EntityPosition): DataEntity => {
    const entity = fixture.runtime.spawn(identifier, at);
    if (entity === undefined) throw new Error(`the fixture declares no ${identifier}`);
    return entity;
};

/** Runs the runtime for a number of ticks, starting from tick 1. */
const run = (fixture: EntityFixture, ticks: number): void => {
    for (let tick = 1; tick <= ticks; tick += 1) fixture.runtime.tick(tick);
};

describe('the goal world over the entity runtime', () => {
    describe('visibility', () => {
        it('checks solid blocks between the eyes of entities in follow range', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 2, z: 0 }, 'minecraft:stone');
            const fixture = fixtureOf(world);
            const observer = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const target = spawned(fixture, 'jsprismarine:breeder', groundAt(3, 0));
            const targetView = fixture.runtime.mobById(target.id);
            if (targetView === undefined) throw new Error('the goal world cannot resolve the target');

            const goalWorld = goalWorldOf(observer.body, fixture.runtime);

            expect(goalWorld.canSee(targetView)).toBe(false);
        });

        it('keeps an in-range target visible through clear blocks', () => {
            const fixture = fixtureOf();
            const observer = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const target = spawned(fixture, 'jsprismarine:breeder', groundAt(3, 0));
            const targetView = fixture.runtime.mobById(target.id);
            if (targetView === undefined) throw new Error('the goal world cannot resolve the target');

            const goalWorld = goalWorldOf(observer.body, fixture.runtime);

            expect(goalWorld.canSee(targetView)).toBe(true);
        });
    });

    describe('breeding', () => {
        it('reports readiness from the active breedable data', () => {
            const fixture = fixtureOf();
            const animal = spawned(fixture, 'jsprismarine:breeder', groundAt(0, 0));
            const world = goalWorldOf(animal.body, fixture.runtime);

            expect(world.isReadyToBreed()).toBe(false);

            fixture.runtime.setInLove(animal.id, 1);
            expect(world.isReadyToBreed()).toBe(true);

            animal.body.breedCooldown = 1;
            expect(world.isReadyToBreed()).toBe(false);
        });

        it('produces a baby from two animals in love', () => {
            const fixture = fixtureOf();
            const first = spawned(fixture, 'jsprismarine:breeder', groundAt(0, 0));
            const second = spawned(fixture, 'jsprismarine:breeder', groundAt(2, 0));
            fixture.runtime.setInLove(first.id, 400);
            fixture.runtime.setInLove(second.id, 400);

            run(fixture, 80);

            const babies = fixture.runtime.all().filter((entity) => entity.instance.hasComponent('minecraft:is_baby'));
            expect(babies).toHaveLength(1);
            expect(babies[0]?.identifier).toBe('jsprismarine:breeder');
        });

        it('leaves two animals that are not in love alone', () => {
            const fixture = fixtureOf();
            spawned(fixture, 'jsprismarine:breeder', groundAt(0, 0));
            spawned(fixture, 'jsprismarine:breeder', groundAt(2, 0));

            run(fixture, 80);

            expect(fixture.runtime.all()).toHaveLength(2);
        });

        it('puts the pair on a cooldown, so one feeding makes one baby', () => {
            const fixture = fixtureOf();
            const first = spawned(fixture, 'jsprismarine:breeder', groundAt(0, 0));
            const second = spawned(fixture, 'jsprismarine:breeder', groundAt(2, 0));
            fixture.runtime.setInLove(first.id, 400);
            fixture.runtime.setInLove(second.id, 400);

            run(fixture, 300);

            expect(first.body.breedCooldown).toBeGreaterThan(0);
            expect(fixture.runtime.all().filter((entity) => entity.identifier === 'jsprismarine:breeder')).toHaveLength(
                3
            );
        });
    });

    describe('riding', () => {
        it('walks a mob onto a mount and leaves it riding', () => {
            const fixture = fixtureOf();
            const mount = spawned(fixture, 'jsprismarine:mount', groundAt(0, 0));
            const rider = spawned(fixture, 'jsprismarine:rider', groundAt(3, 0));

            run(fixture, 20);

            expect(fixture.runtime.vehicleOf(rider.body)?.id).toBe(mount.id);
            expect(fixture.runtime.ridersOf(mount.body).map((seated) => seated.id)).toEqual([rider.id]);
        });

        it('carries the rider wherever the mount goes', () => {
            const fixture = fixtureOf();
            const mount = spawned(fixture, 'jsprismarine:mount', groundAt(0, 0));
            const rider = spawned(fixture, 'jsprismarine:rider', groundAt(3, 0));
            run(fixture, 20);

            mount.position = groundAt(10, 10);
            run(fixture, 1);

            expect(rider.position).toEqual(mount.position);
        });

        it('starts the ridden mob’s own steering goal once someone is on it', () => {
            const fixture = fixtureOf();
            const mount = spawned(fixture, 'jsprismarine:mount', groundAt(0, 0));
            spawned(fixture, 'jsprismarine:rider', groundAt(3, 0));

            run(fixture, 20);

            expect(mount.instance.goals.runningGoals()).toContain('minecraft:behavior.controlled_by_player');
        });

        it('takes a rider off again', () => {
            const fixture = fixtureOf();
            const mount = spawned(fixture, 'jsprismarine:mount', groundAt(0, 0));
            const rider = spawned(fixture, 'jsprismarine:rider', groundAt(3, 0));
            run(fixture, 20);

            fixture.runtime.dismount(rider.body);

            expect(fixture.runtime.vehicleOf(rider.body)).toBeUndefined();
            expect(fixture.runtime.ridersOf(mount.body)).toEqual([]);
        });
    });

    describe('shooting', () => {
        it('fires the projectile its minecraft:shooter names at the target', () => {
            const fixture = fixtureOf();
            const archer = spawned(fixture, 'jsprismarine:archer', groundAt(0, 0));
            const victim = spawned(fixture, 'jsprismarine:pet', groundAt(5, 0));
            archer.target = victim.id;

            run(fixture, 3);

            const darts = fixture.runtime.all().filter((entity) => entity.identifier === 'jsprismarine:dart');
            expect(darts.length).toBeGreaterThan(0);
            expect(darts[0]?.body.velocity.x).toBeGreaterThan(0);
        });

        it('says so rather than firing nothing when the entity has no projectile', () => {
            const fixture = fixtureOf();
            const pet = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const victim = spawned(fixture, 'jsprismarine:coward', groundAt(5, 0));

            fixture.runtime.shoot(
                pet.body,
                { id: victim.id, position: () => victim.position, view: () => ({}) },
                undefined
            );

            expect(fixture.reports.join('\n')).toContain('no projectile to shoot');
        });
    });

    describe('targeting a player', () => {
        it('finds the player among the mobs it searches, walks to them and swings', () => {
            const world = new TestEntityWorld({
                players: [{ id: 700, identifier: 'minecraft:player', position: groundAt(8, 0) }]
            });
            const fixture = fixtureOf(world);
            const stalker = spawned(fixture, 'jsprismarine:stalker', groundAt(0, 0));

            run(fixture, 60);

            expect(stalker.target).toBe(700);
            expect(stalker.position.x).toBeGreaterThan(4);
            expect(world.hits.map((hit) => hit.id)).toContain(700);
        });

        it('leaves a player alone when no entry of its table accepts one', () => {
            const world = new TestEntityWorld({
                players: [{ id: 700, identifier: 'minecraft:player', position: groundAt(8, 0) }]
            });
            const fixture = fixtureOf(world);
            // `avenger` targets only what its owner is fighting, and it has no owner.
            const bystander = spawned(fixture, 'jsprismarine:avenger', groundAt(0, 0));

            run(fixture, 60);

            expect(bystander.target).toBeUndefined();
            expect(world.hits).toEqual([]);
        });
    });

    describe('owners', () => {
        it('walks a pet to the player that owns it', () => {
            const world = new TestEntityWorld({
                players: [{ id: 500, identifier: 'minecraft:player', position: groundAt(12, 0) }]
            });
            const fixture = fixtureOf(world);
            const pet = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            fixture.runtime.setOwner(pet.id, 500);

            run(fixture, 40);

            expect(pet.position.x).toBeGreaterThan(5);
        });

        it('takes the owner’s target as its own', () => {
            const fixture = fixtureOf();
            const owner = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const wolf = spawned(fixture, 'jsprismarine:avenger', groundAt(1, 0));
            const enemy = spawned(fixture, 'jsprismarine:coward', groundAt(4, 0));
            fixture.runtime.setOwner(wolf.id, owner.id);
            owner.target = enemy.id;

            run(fixture, 3);

            expect(wolf.target).toBe(enemy.id);
        });
    });

    describe('damage', () => {
        it('turns a hurt mob on whatever hit it', () => {
            const fixture = fixtureOf();
            const victim = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const attacker = spawned(fixture, 'jsprismarine:coward', groundAt(2, 0));

            fixture.runtime.hurt(victim, attacker.id, 'entity_attack', 1);
            run(fixture, 3);

            expect(victim.target).toBe(attacker.id);
        });

        it('sends a hurt animal running', () => {
            const fixture = fixtureOf();
            const coward = spawned(fixture, 'jsprismarine:coward', groundAt(0, 0));

            fixture.runtime.hurt(coward, undefined, 'fall', 1);
            run(fixture, 10);

            expect(coward.instance.goals.runningGoals()).toContain('minecraft:behavior.panic');
        });

        it('turns a pushed mob on whoever pushed it', () => {
            const fixture = fixtureOf();
            const pushed = spawned(fixture, 'jsprismarine:bruiser', groundAt(0, 0));
            const pusher = spawned(fixture, 'jsprismarine:coward', groundAt(2, 0));

            fixture.runtime.knockback(
                pusher.body,
                { id: pushed.id, position: () => pushed.position, view: () => ({}) },
                0.4,
                0.1
            );
            run(fixture, 3);

            expect(pushed.target).toBe(pusher.id);
        });

        it('totals the damage each source dealt, most recent last', () => {
            const fixture = fixtureOf();
            const victim = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));

            fixture.runtime.hurt(victim, 7, 'entity_attack', 2);
            fixture.runtime.hurt(victim, 9, 'entity_attack', 1);
            fixture.runtime.hurt(victim, 7, 'entity_attack', 3);

            expect(victim.body.damage.records()).toEqual([
                { sourceId: 9, cause: 'entity_attack', total: 1 },
                { sourceId: 7, cause: 'entity_attack', total: 5 }
            ]);
        });
    });

    describe('leaping', () => {
        it('throws the entity at its target', () => {
            const world = new TestEntityWorld({ random: [0.1] });
            const fixture = fixtureOf(world);
            const cat = spawned(fixture, 'jsprismarine:leaper', groundAt(0, 0));
            const prey = spawned(fixture, 'jsprismarine:coward', groundAt(3, 0));
            cat.target = prey.id;

            run(fixture, 2);

            expect(cat.position.x).toBeGreaterThan(0);
            expect(cat.position.y).toBeGreaterThan(FLOOR_Y + 1);
        });

        it('brings it back down onto the floor', () => {
            const world = new TestEntityWorld({ random: [0.1] });
            const fixture = fixtureOf(world);
            const cat = spawned(fixture, 'jsprismarine:leaper', groundAt(0, 0));
            const prey = spawned(fixture, 'jsprismarine:coward', groundAt(3, 0));
            cat.target = prey.id;

            run(fixture, 40);

            expect(cat.body.airborne).toBe(false);
            expect(cat.position.y).toBe(FLOOR_Y + 1);
        });
    });

    describe('items', () => {
        it('picks a dropped stack up into its inventory', () => {
            const world = new TestEntityWorld();
            const fixture = fixtureOf(world);
            const collector = spawned(fixture, 'jsprismarine:collector', groundAt(0, 0));
            world.dropItem({ x: 3, y: FLOOR_Y + 1, z: 0 }, { identifier: 'minecraft:wheat', count: 2 });

            run(fixture, 20);

            expect(collector.body.inventory).toEqual(['minecraft:wheat', 'minecraft:wheat']);
            expect(world.host.items?.()).toEqual([]);
        });

        it('hands an item to another mob', () => {
            const fixture = fixtureOf();
            const giver = spawned(fixture, 'jsprismarine:giver', groundAt(0, 0));
            const taker = spawned(fixture, 'jsprismarine:collector', groundAt(2, 0));
            giver.body.inventory.push('minecraft:bread');

            run(fixture, 20);

            expect(taker.body.inventory).toEqual(['minecraft:bread']);
            expect(giver.body.inventory).toEqual([]);
        });
    });

    describe('blocks', () => {
        it('breaks the block it takes and carries it away', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 2, y: FLOOR_Y + 1, z: 0 }, 'minecraft:redstone_lamp');
            const fixture = fixtureOf(world);
            const enderman = spawned(fixture, 'jsprismarine:thief', groundAt(0, 0));

            run(fixture, 3);

            expect(enderman.carried).toBe('minecraft:redstone_lamp');
            expect(world.world.blocks.get({ x: 2, y: FLOOR_Y + 1, z: 0 })?.identifier).toBe('minecraft:air');
        });

        it('leaves the block where it stands with mobGriefing off', () => {
            const world = new TestEntityWorld({ gameRules: { mobGriefing: false } });
            world.setBlock({ x: 2, y: FLOOR_Y + 1, z: 0 }, 'minecraft:redstone_lamp');
            const fixture = fixtureOf(world);
            spawned(fixture, 'jsprismarine:thief', groundAt(0, 0));

            run(fixture, 3);

            expect(world.world.blocks.get({ x: 2, y: FLOOR_Y + 1, z: 0 })?.identifier).toBe('minecraft:redstone_lamp');
        });
    });

    describe('points of interest', () => {
        it('walks a villager to its bed at night and puts it to sleep', () => {
            const world = new TestEntityWorld({ dayTime: 15000 });
            world.setBlock({ x: 6, y: FLOOR_Y, z: 0 }, 'minecraft:bed');
            const fixture = fixtureOf(world);
            const villager = spawned(fixture, 'jsprismarine:sleeper', groundAt(0, 0));

            run(fixture, 40);

            expect(villager.body.sleeping).toBe(true);
            expect(villager.position.x).toBeGreaterThan(4);
        });

        it('keeps a villager awake when there is no bed to sleep in', () => {
            const world = new TestEntityWorld({ dayTime: 15000 });
            const fixture = fixtureOf(world);
            const villager = spawned(fixture, 'jsprismarine:sleeper', groundAt(0, 0));

            run(fixture, 40);

            expect(villager.body.sleeping).toBe(false);
        });

        it('calls a cell with a roof over it indoors, and one without it outdoors', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 4, y: FLOOR_Y + 4, z: 0 }, 'minecraft:stone');
            const fixture = fixtureOf(world);

            expect(fixture.runtime.poi('indoors', groundAt(0, 0), 16)).toEqual({ x: 4.5, y: FLOOR_Y + 1, z: 0.5 });
            expect(fixture.runtime.poi('outdoors', groundAt(0, 0), 16)).toEqual({ x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        });

        it('hands back a point nothing in the blocks marks, once it is recorded', () => {
            const fixture = fixtureOf();
            fixture.runtime.recordPointOfInterest('buried_treasure', groundAt(20, 0));

            expect(fixture.runtime.poi('buried_treasure', groundAt(0, 0), 64)).toEqual(groundAt(20, 0));
            expect(fixture.runtime.poi('buried_treasure', groundAt(0, 0), 4)).toBeUndefined();
        });

        it('says once that a kind nothing indexes is a kind nothing finds', () => {
            const fixture = fixtureOf();

            fixture.runtime.poi('suspicious_location', groundAt(0, 0), 32);
            fixture.runtime.poi('suspicious_location', groundAt(0, 0), 32);

            expect(fixture.reports.filter((line) => line.includes('suspicious_location'))).toHaveLength(1);
        });
    });

    describe('sitting and sleeping', () => {
        it('sits the entity down, and the filters see it sitting', () => {
            const fixture = fixtureOf();
            const panda = spawned(fixture, 'jsprismarine:lounger', groundAt(0, 0));

            run(fixture, 2);

            expect(panda.body.sitting).toBe(true);
            expect(panda.instance.filterContext().self.flag?.('is_sitting')).toBe(true);
        });
    });

    describe('trading', () => {
        it('holds the trader still and its head on the player it opened the screen for', () => {
            const world = new TestEntityWorld({
                players: [{ id: 700, identifier: 'minecraft:player', position: groundAt(2, 0) }]
            });
            const fixture = fixtureOf(world);
            const trader = spawned(fixture, 'jsprismarine:shopkeeper', groundAt(0, 0));

            fixture.runtime.openTrade(trader.body, { id: 700, position: () => groundAt(2, 0), view: () => ({}) });
            run(fixture, 3);

            expect(trader.body.tradingPlayer).toBe(700);
            expect(trader.instance.goals.runningGoals()).toContain('minecraft:behavior.trade_with_player');
            expect(trader.instance.goals.runningGoals()).toContain('minecraft:behavior.look_at_trading_player');
        });

        it('refuses to open a screen for an entity with no trade table, and says so', () => {
            const fixture = fixtureOf();
            const pet = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));

            fixture.runtime.openTrade(pet.body, { id: 700, position: () => groundAt(2, 0), view: () => ({}) });

            expect(pet.body.tradingPlayer).toBeUndefined();
            expect(fixture.reports.join('\n')).toContain('carries no trade table');
        });
    });

    describe('exploding', () => {
        it('takes the entity and hurts what stood next to it', () => {
            const world = new TestEntityWorld();
            const fixture = fixtureOf(world);
            const creeper = spawned(fixture, 'jsprismarine:bomber', groundAt(0, 0));
            const bystander = spawned(fixture, 'jsprismarine:pet', groundAt(2, 0));

            fixture.runtime.explode(creeper.body);

            expect(fixture.runtime.byId(creeper.id)).toBeUndefined();
            expect(bystander.instance.attributes.get('health')?.current).toBeLessThan(20);
            expect(world.sounds).toContain('random.explode');
        });

        it('takes the ground out from under it', () => {
            const world = new TestEntityWorld();
            const fixture = fixtureOf(world);
            const creeper = spawned(fixture, 'jsprismarine:bomber', groundAt(0, 0));

            fixture.runtime.explode(creeper.body);

            expect(world.world.blocks.get({ x: 0, y: FLOOR_Y, z: 0 })?.identifier).toBe('minecraft:air');
        });

        it('cannot get through obsidian, whose 1200 outruns a creeper', () => {
            const world = new TestEntityWorld();
            for (let x = -4; x <= 4; x += 1) {
                for (let z = -4; z <= 4; z += 1) {
                    world.setBlock({ x, y: FLOOR_Y, z }, 'minecraft:obsidian');
                }
            }
            const fixture = fixtureOf(world);
            const creeper = spawned(fixture, 'jsprismarine:bomber', groundAt(0, 0));

            fixture.runtime.explode(creeper.body);

            expect(world.world.blocks.get({ x: 0, y: FLOOR_Y, z: 0 })?.identifier).toBe('minecraft:obsidian');
        });

        it('leaves the ground alone with mobGriefing off, and still hurts what stood there', () => {
            const world = new TestEntityWorld({ gameRules: { mobGriefing: false } });
            const fixture = fixtureOf(world);
            const creeper = spawned(fixture, 'jsprismarine:bomber', groundAt(0, 0));
            const bystander = spawned(fixture, 'jsprismarine:pet', groundAt(2, 0));

            fixture.runtime.explode(creeper.body);

            expect(world.world.blocks.get({ x: 0, y: FLOOR_Y, z: 0 })?.identifier).toBe('minecraft:stone');
            expect(world.drops).toHaveLength(0);
            expect(bystander.instance.attributes.get('health')?.current).toBeLessThan(20);
        });

        it('takes the ground out again once mobGriefing is back on', () => {
            const world = new TestEntityWorld({ gameRules: { mobGriefing: true } });
            const fixture = fixtureOf(world);
            const creeper = spawned(fixture, 'jsprismarine:bomber', groundAt(0, 0));

            fixture.runtime.explode(creeper.body);

            expect(world.world.blocks.get({ x: 0, y: FLOOR_Y, z: 0 })?.identifier).toBe('minecraft:air');
        });

        it('shoves what it does not kill away from itself', () => {
            const world = new TestEntityWorld();
            const fixture = fixtureOf(world);
            const creeper = spawned(fixture, 'jsprismarine:bomber', groundAt(0, 0));
            const bystander = spawned(fixture, 'jsprismarine:pet', groundAt(4, 0));

            fixture.runtime.explode(creeper.body);

            expect(bystander.body.velocity.x).toBeGreaterThan(0);
        });
    });

    /**
     * The order the neighbor search hands its candidates back in.
     *
     * Most goals that search take the first candidate the list accepts, so the
     * order decides which mob a zombie attacks and which cow a cow breeds
     * with. It is a contract rather than an accident, and these pin it: the
     * search is a hot path and has been made faster twice.
     */
    describe('the neighbor search', () => {
        /** The ids `mobs` hands back for one entity's search. */
        const neighborsOf = (fixture: EntityFixture, entity: DataEntity, radius: number) =>
            goalWorldOf(entity.body, fixture.runtime)
                .mobs(radius)
                .map((mob) => mob.id);

        it('hands the nearest mob back first', () => {
            const fixture = fixtureOf();
            const searcher = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const far = spawned(fixture, 'jsprismarine:pet', groundAt(8, 0));
            const near = spawned(fixture, 'jsprismarine:pet', groundAt(2, 0));

            expect(neighborsOf(fixture, searcher, 16)).toEqual([near.id, far.id]);
        });

        it('keeps two mobs the same distance away in spawn order', () => {
            const fixture = fixtureOf();
            const searcher = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const first = spawned(fixture, 'jsprismarine:pet', groundAt(0, 5));
            const second = spawned(fixture, 'jsprismarine:pet', groundAt(5, 0));
            const third = spawned(fixture, 'jsprismarine:pet', groundAt(-5, 0));

            expect(neighborsOf(fixture, searcher, 16)).toEqual([first.id, second.id, third.id]);
        });

        it('puts a player behind a mob that is the same distance away', () => {
            const world = new TestEntityWorld({
                players: [{ id: 900, identifier: 'player', position: groundAt(5, 0) }]
            });
            const fixture = fixtureOf(world);
            const searcher = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const mate = spawned(fixture, 'jsprismarine:pet', groundAt(0, 5));

            expect(neighborsOf(fixture, searcher, 16)).toEqual([mate.id, 900]);
        });

        it('takes a mob standing exactly on the radius and leaves the one past it', () => {
            const fixture = fixtureOf();
            const searcher = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));
            const onEdge = spawned(fixture, 'jsprismarine:pet', groundAt(8, 0));
            spawned(fixture, 'jsprismarine:pet', groundAt(8.000_01, 0));

            expect(neighborsOf(fixture, searcher, 8)).toEqual([onEdge.id]);
        });

        it('leaves the searching entity out of its own search', () => {
            const fixture = fixtureOf();
            const searcher = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));

            expect(neighborsOf(fixture, searcher, 16)).toEqual([]);
        });

        it('hands players back nearest first, in host order among ties', () => {
            const world = new TestEntityWorld({
                players: [
                    { id: 900, identifier: 'player', position: groundAt(6, 0) },
                    { id: 901, identifier: 'player', position: groundAt(0, 2) },
                    { id: 902, identifier: 'player', position: groundAt(0, 6) },
                    { id: 903, identifier: 'player', position: groundAt(40, 0) }
                ]
            });
            const fixture = fixtureOf(world);
            const searcher = spawned(fixture, 'jsprismarine:pet', groundAt(0, 0));

            const found = goalWorldOf(searcher.body, fixture.runtime)
                .players(16)
                .map((player) => player.id);

            expect(found).toEqual([901, 900, 902]);
        });
    });
});
