import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { overlayPackPath } from '../../content/packStack';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { serverWorldSource } from '../../content/world/serverSource';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Item } from '../../item/Item';
import type ItemManager from '../../item/ItemManager';
import { testEntityServer } from '../../testing/entityServer';
import { stub } from '../../testing/stub.test.helper';
import { entityCommandHost } from '../../command/host/entities';
import { Scoreboard } from '../../command/host/scoreboard';
import type WorldManager from '../../world/WorldManager';
import BlockUpdateScheduler from '../../world/BlockUpdateScheduler';
import Chunk from '../../world/chunk/Chunk';
import LevelDB from '../../world/providers/leveldb/LevelDB';
import { Dimensions } from '../../world/Dimension';
import GameRuleManager from '../../world/GameRuleManager';
import { createEngineWorld } from '../../world/EngineWorld';
import EntityGrid from '../../world/EntityGrid';
import { Position } from '../../world/Position';
import { World } from '../../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../../world/WorldChangeSink';
import { WorldSystems } from '../../world/WorldSystems';
import { GenericEntity } from '../GenericEntity';
import { Item as ItemEntity } from '../other/Item';
import { EntityRuntimes } from './live';
import type { LiveEntityRuntime } from './live';

/**
 * The data-driven entity runtime, driving a real world.
 *
 * Everything below the test is the server's own: a real `Chunk` stack, a real
 * `World`, the real `serverWorldSource`, the real content build over real
 * behavior-pack files, and the real spawn, goal, breeding, trading and loot
 * packages. Only the disk, the network and the server object around them are
 * replaced. The assertions are about what is in the world afterwards, because
 * that is the thing a player sees.
 */

/** The two blocks this fixture declares, which are also the whole of its palette. */
const BLOCKS = ['minecraft:air', 'minecraft:stone'] as const;

const DIMENSION = 'minecraft:overworld';

/** The y the stone floor's top sits at. Everything above it is air. */
const FLOOR_Y = 63;

/** Where a mob stands on that floor. */
const GROUND_Y = FLOOR_Y + 1;

/** How far out, in chunks, the fixture loads ground, which is the spawner's own radius. */
const LOADED_RADIUS = 4;

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

/** A palette of exactly the fixture's blocks, with each one's real Bedrock states. */
const fixturePalette = (): BlockPalette =>
    new BlockPalette(BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model]));

/** One entity file, in the shape a behavior pack writes. */
const entityFile = (identifier: string, body: Record<string, unknown>) =>
    definitionOf('entities', identifier, {
        format_version: '1.21.0',
        'minecraft:entity': {
            description: { identifier, is_spawnable: true, is_summonable: true },
            ...body
        }
    });

/** The components every mob here needs to stand up, walk and be hit. */
const MOB_BASE = {
    'minecraft:health': { value: 20, max: 20 },
    'minecraft:attack': { damage: 3 },
    'minecraft:movement': { value: 10 },
    'minecraft:follow_range': { value: 24 },
    'minecraft:collision_box': { width: 0.6, height: 1.8 },
    'minecraft:navigation.walk': { can_walk: true },
    'minecraft:type_family': { family: ['mob'] }
};

/** The four mobs under test, each carrying exactly the components its behavior needs. */
const ENTITIES = new Map([
    [
        'minecraft:cow',
        entityFile('minecraft:cow', {
            components: {
                ...MOB_BASE,
                'minecraft:health': { value: 10, max: 10 },
                'minecraft:type_family': { family: ['cow', 'mob'] },
                'minecraft:loot': { table: 'loot_tables/entities/cow.json' },
                'minecraft:behavior.random_stroll': {
                    priority: 6,
                    speed_multiplier: 1,
                    interval: 120,
                    xz_dist: 6,
                    y_dist: 1
                }
            }
        })
    ],
    [
        'minecraft:zombie',
        entityFile('minecraft:zombie', {
            components: {
                ...MOB_BASE,
                'minecraft:type_family': { family: ['zombie', 'monster', 'mob'] },
                'minecraft:behavior.nearest_attackable_target': {
                    priority: 1,
                    within_radius: 24,
                    reselect_targets: true,
                    entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 24 }]
                },
                'minecraft:behavior.melee_box_attack': { priority: 2, speed_multiplier: 1, track_target: true }
            }
        })
    ],
    [
        'minecraft:sheep',
        entityFile('minecraft:sheep', {
            components: {
                ...MOB_BASE,
                'minecraft:type_family': { family: ['sheep', 'mob'] },
                'minecraft:breedable': { require_tame: false, breed_items: ['minecraft:wheat'], breed_cooldown: 30 },
                'minecraft:behavior.breed': { priority: 1, speed_multiplier: 1 }
            },
            component_groups: { baby: { 'minecraft:is_baby': {} } },
            events: { 'minecraft:entity_born': { add: { component_groups: ['baby'] } } }
        })
    ],
    [
        'minecraft:villager_v2',
        entityFile('minecraft:villager_v2', {
            components: {
                ...MOB_BASE,
                'minecraft:type_family': { family: ['villager', 'mob'] },
                'minecraft:economy_trade_table': {
                    table: 'trading/economy_trades/farmer_trades.json',
                    display_name: 'entity.villager.farmer',
                    persist_trades: true
                },
                'minecraft:behavior.trade_with_player': { priority: 1 }
            }
        })
    ],
    [
        // A mob no written class answers to and no vanilla pack declares, which is the whole
        // point of the data path: the only thing that can build one is the content registry.
        'jsprismarine:dustling',
        entityFile('jsprismarine:dustling', {
            components: {
                ...MOB_BASE,
                'minecraft:health': { value: 6, max: 6 },
                'minecraft:type_family': { family: ['dustling', 'mob'] },
                'minecraft:behavior.random_stroll': {
                    priority: 6,
                    speed_multiplier: 1,
                    interval: 120,
                    xz_dist: 6,
                    y_dist: 1
                }
            },
            component_groups: { settled: { 'minecraft:type_family': { family: ['dustling', 'settled'] } } },
            events: { 'minecraft:entity_spawned': { add: { component_groups: ['settled'] } } }
        })
    ]
]);

/**
 * The cow's spawn rule, in the shape a vanilla `spawn_rules/` file is written.
 *
 * No brightness and no biome filter, because the fixture's chunks carry
 * neither a light engine run nor a biome definition, and a rule that asked
 * for either would be testing the fixture rather than the spawner.
 */
const SPAWN_RULES = new Map([
    [
        'minecraft:cow',
        definitionOf('spawnRules', 'minecraft:cow', {
            format_version: '1.8.0',
            'minecraft:spawn_rules': {
                description: { identifier: 'minecraft:cow', population_control: 'animal' },
                conditions: [
                    {
                        'minecraft:spawns_on_surface': {},
                        'minecraft:weight': { default: 10 },
                        'minecraft:herd': { min_size: 2, max_size: 3 },
                        'minecraft:spawns_on_block_filter': 'minecraft:stone'
                    }
                ]
            }
        })
    ]
]);

/** Java's cow loot table, cut to the one drop this asserts on. */
const LOOT = new Map([
    [
        'minecraft:entities/cow',
        definitionOf('lootTablesJava', 'minecraft:entities/cow', {
            type: 'minecraft:entity',
            pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:leather' }] }]
        })
    ],
    [
        'minecraft:blocks/stone',
        definitionOf('lootTablesJava', 'minecraft:blocks/stone', {
            type: 'minecraft:block',
            pools: [
                {
                    rolls: 1,
                    // Two halves of the break's context in one condition: the y range
                    // reads `origin`, which only a break that said where it happened
                    // supplies, and the dimension reads the level view, which only a
                    // break that bound one supplies. A roll with neither drops nothing.
                    condition: {
                        type: 'minecraft:location_check',
                        predicate: {
                            position: { y: { min: FLOOR_Y, max: FLOOR_Y } },
                            dimension: DIMENSION
                        }
                    },
                    entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }]
                }
            ],
            random_sequence: 'minecraft:blocks/stone'
        })
    ]
]);

/** The farmer's trade table, in the shape a vanilla `trading/` file is written. */
const TRADES = new Map([
    [
        'trading/economy_trades/farmer_trades.json',
        definitionOf('tradeTables', 'trading/economy_trades/farmer_trades.json', {
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:wheat', quantity: 20 }],
                                    gives: [{ item: 'minecraft:emerald', quantity: 1 }],
                                    max_uses: 16
                                }
                            ]
                        }
                    ]
                }
            ]
        })
    ]
]);

/** The runtime id of a block in the fixture's palette. */
const idOf = (identifier: string): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, {});
    if (runtimeId === null) throw new Error(`no ${identifier} in this server's catalog`);
    return runtimeId;
};

/** One chunk of flat stone, with its top at {@link FLOOR_Y}. */
const flatChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z);
    const stone = idOf('minecraft:stone');
    // Four layers rather than a full column: the spawn pass reads the highest block and the
    // one below the spawn position, and filling to the world floor is 30 times the writes.
    for (let bx = 0; bx < 16; bx += 1) for (let bz = 0; bz < 16; bz += 1) chunk.fillColumn(bx, bz, 60, FLOOR_Y, stone);
    return chunk;
};

/** A player standing at a position, with everything but its body replaced. */
const playerAt = (world: World, x: number, z: number): Player =>
    Object.assign(Object.create(Player.prototype), {
        position: new Position(x, GROUND_Y, z, world),
        pitch: 0,
        yaw: 0,
        headYaw: 0,
        runtimeId: 1n,
        // The world only hands out players it believes are still connected.
        connected: true,
        server: world.getServer(),
        metadata: { sprinting: false },
        attributes: { getValue: () => 20, setValue: () => true, getAttribute: () => null }
    });

/** What the fixture records instead of putting it on a wire. */
interface Broadcasts {
    readonly moved: string[];
}

/**
 * A `World` reduced to what the entity runtime touches.
 *
 * Built on the real prototype with real chunks and real `WorldSystems`, so the
 * entity list, the chunk reads and the tick lists are the server's own.
 */
const liveWorld = (): {
    world: World;
    broadcasts: Broadcasts;
    runtimes: EntityRuntimes;
    hold(content: ServerContent): void;
} => {
    const broadcasts: Broadcasts = { moved: [] };
    let content: ServerContent | undefined;
    // Keyed the way `World` keys its own map. A bigint here is not a type error, because
    // `pnpm typecheck` skips test files, and `getLoadedChunk` would answer null for every
    // chunk in the fixture rather than throw.
    const chunks = new Map<number, Chunk>();
    for (let x = -LOADED_RADIUS; x <= LOADED_RADIUS; x += 1)
        for (let z = -LOADED_RADIUS; z <= LOADED_RADIUS; z += 1) chunks.set(Chunk.packXZ(x, z), flatChunk(x, z));

    const runtimes = new EntityRuntimes();
    const server: Server = Object.assign(testEntityServer(), {
        getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL, getEntityTrackingInterval: () => 20 }),
        // What `World.dataEntities` reads, and therefore what tells `/summon` that this
        // world runs its mobs through the data path rather than the written classes.
        getEntityRuntime: (dimension: string) => runtimes.at(dimension),
        getWorldManager: () => stub<WorldManager>({ getDefaultWorld: () => world, getWorlds: () => [world] }),
        // Every identifier is an item here, because the point of the loot test is which
        // identifier the table rolled rather than what this server has registered.
        getItemManager: () =>
            stub<ItemManager>({ getItem: (name: string) => new Item({ id: 1, name, meta: 0, count: 1 }) }),
        getContent: () => content
    });

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks,
        currentTick: 0,
        spawn: new Vector3(8, GROUND_Y, 8),
        dimension: Dimensions.Overworld,
        blockUpdates: new BlockUpdateScheduler(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        entityGrid: new EntityGrid(),
        players: new Map(),
        // A real one, because a `World` built on its prototype never ran the constructor that
        // makes it, and the content level group reads the rules through it.
        gameRuleManager: new GameRuleManager(server),
        server
    });

    world.attachChangeSink({
        ...NULL_WORLD_CHANGE_SINK,
        entityMoved: (entity) => void broadcasts.moved.push(entity.getType())
    });

    Object.assign(world, {
        systems: new WorldSystems({
            view: {
                dimension: Dimensions.Overworld,
                blockAt: (x: number, y: number, z: number) => world.loadedBlockAt(x, y, z),
                loadedChunks: () => [...chunks.values()].map((chunk) => ({ x: chunk.getX(), z: chunk.getZ() }))
            },
            world: createEngineWorld(world)
        })
    });

    return {
        world,
        broadcasts,
        runtimes,
        hold: (built) => {
            content = built;
        }
    };
};

/** Builds the content over the live world, the way `Server.enableContent` does. */
const buildOver = (world: World, runtimes: EntityRuntimes): ServerContent => {
    let built: ServerContent | undefined;
    const content = buildServerContent({
        load: () => ({
            definitions: definitionsOf({
                blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                entities: ENTITIES,
                spawnRules: SPAWN_RULES,
                tradeTables: TRADES,
                lootTablesJava: LOOT
            }),
            diagnostics: []
        }),
        blockPalette: fixturePalette(),
        itemDefinitions: vanillaItemDefinitions().filter((definition) =>
            ['minecraft:leather', 'minecraft:wheat', 'minecraft:emerald', 'minecraft:cobblestone'].includes(
                definition.identifier
            )
        ),
        seed: 1234n,
        world: serverWorldSource({
            worldFor: () => world,
            content: () => built!,
            seed: 1234n,
            difficulty: () => Difficulty.NORMAL,
            // The seeded source the server itself uses, left alone: a constant draw sends
            // every wander at the same unreachable cell and measures the path finder's
            // failure case rather than the goal.
            entityRuntimes: runtimes
        })
    });
    built = content;
    return content;
};

/** The whole fixture, for the benchmark beside this file. */
export const fixtureForBench = () => {
    const { world, runtimes } = liveWorld();
    buildOver(world, runtimes);
    return { world, live: runtimes.at(DIMENSION)! };
};

/** The identifiers of everything in the world, which is what a client would be sent. */
const typesIn = (world: World): string[] => world.getEntities().map((entity) => entity.getType());

describe('the data-driven entity runtime over a live world', () => {
    let world: World;
    let broadcasts: Broadcasts;
    let runtimes: EntityRuntimes;
    let live: LiveEntityRuntime;

    beforeEach(() => {
        let hold: (built: ServerContent) => void;
        ({ world, broadcasts, runtimes, hold } = liveWorld());
        hold(buildOver(world, runtimes));

        const opened = runtimes.at(DIMENSION);
        if (opened === undefined) throw new Error('the content world opened no entity runtime');
        live = opened;
    });

    /** Runs the runtime for a number of ticks, from tick 1. */
    const run = async (ticks: number): Promise<void> => {
        for (let tick = 1; tick <= ticks; tick += 1) await live.tick(tick);
    };

    /** Puts a player in the world, which is what the spawner spawns around. */
    const addPlayer = (x: number, z: number): Player => {
        const player = playerAt(world, x, z);
        // Both maps, the way `World.addEntity` fills them: `getPlayers` reads one and
        // `getEntity`, which is how a blow finds whoever it landed on, reads the other.
        Object.assign(world, {
            players: new Map([[player.getRuntimeId(), player]]),
            entities: new Map([[player.getRuntimeId(), player]])
        });
        return player;
    };

    it('wires the entity subsystem’s two groups into the content world', () => {
        // Both used to throw `NotWiredError` naming the entity subsystem.
        expect(() => live.runtime.content().world.spawnWorld.players()).not.toThrow();
        expect(live.runtime.content().world.brainWorld()).toBeDefined();
    });

    describe('spawning', () => {
        it('spawns a herd from a real spawn rule into real chunks', async () => {
            addPlayer(8, 8);

            // The animal pool cycles once every 400 ticks, which is the cadence
            // `@jsprismarine/spawning` carries for it.
            await live.tick(400);

            const cows = live.runtime.all().filter((entity) => entity.identifier === 'minecraft:cow');
            expect(cows.length).toBeGreaterThan(0);
            expect(live.runtime.poolCount('animal')).toBe(cows.length);
            // Standing on the floor the chunk actually carries, not at a guessed height.
            for (const cow of cows) expect(cow.position.y).toBe(GROUND_Y);
        });

        it('gives every spawned mob a body the clients are sent', async () => {
            addPlayer(8, 8);

            await live.tick(400);

            const cows = live.runtime.all().length;
            expect(typesIn(world).filter((type) => type === 'minecraft:cow')).toHaveLength(cows);
            expect(live.bodies.size).toBe(cows);
        });

        it('spawns nothing with nobody in the world to spawn around', async () => {
            await live.tick(400);

            expect(live.runtime.all()).toEqual([]);
        });

        it('keeps the body moving where the runtime moves the entity', async () => {
            addPlayer(8, 8);
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            // Long enough for the one-tick-in-120 stroll to start, which is vanilla's own
            // cadence for the goal.
            await run(400);

            const body = live.bodies.bodyOf(cow.id);
            expect(body?.getPosition().getX()).toBeCloseTo(cow.position.x, 5);
            expect(body?.getPosition().getZ()).toBeCloseTo(cow.position.z, 5);
            expect(broadcasts.moved).toContain('minecraft:cow');
        });
    });

    describe('combat', () => {
        it('walks a zombie to a player and hurts them', async () => {
            const player = addPlayer(8, 0);
            const hits: number[] = [];
            Object.assign(player, {
                damage: async (amount: number) => {
                    hits.push(amount);
                    return true;
                }
            });

            const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');

            await run(60);

            expect(zombie.target).toBe(Number(player.getRuntimeId()));
            expect(zombie.position.x).toBeGreaterThan(4);
            expect(hits).toContain(3);
        });

        it('drops Java’s loot when a mob is killed, and takes its body away', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            live.runtime.kill(cow);
            await run(1);

            const dropped = world
                .getEntities()
                .filter((entity) => entity instanceof ItemEntity)
                .map((entity) => entity.getItem()?.getItem().getName());
            expect(dropped).toEqual(['minecraft:leather']);
            expect(live.bodies.bodyOf(cow.id)).toBeUndefined();
            expect(typesIn(world)).not.toContain('minecraft:cow');
        });

        it('carries a blow dealt to the body back into the runtime', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);

            await live.bodies.bodyOf(cow.id)!.damage(4);
            await run(1);

            expect(cow.instance.attributes.get('health')?.current).toBe(6);
        });
    });

    describe('harvesting', () => {
        /** What is lying on the ground, as item identifiers. */
        const lying = (): Array<string | undefined> =>
            world
                .getEntities()
                .filter((entity) => entity instanceof ItemEntity)
                .map((entity) => entity.getItem()?.getItem().getName());

        it('rolls Java’s table for the block a mob broke, with the position and the world', async () => {
            live.runtime.breakBlock({ x: 8, y: FLOOR_Y, z: 8 });
            await run(1);

            expect(world.loadedBlockAt(8, FLOOR_Y, 8)?.name).toBe('minecraft:air');
            // The stone table's only pool is behind a `location_check`, so cobblestone on
            // the ground means the roll was told where the break happened and which world
            // to read. The harvest used to roll with neither and the pool refused.
            expect(lying()).toEqual(['minecraft:cobblestone']);
        });

        it('takes the block and leaves nothing with doTileDrops off', async () => {
            world.getGameRuleManager()?.setGameRule('doTileDrops', false, true);

            live.runtime.breakBlock({ x: 8, y: FLOOR_Y, z: 8 });
            await run(1);

            expect(world.loadedBlockAt(8, FLOOR_Y, 8)?.name).toBe('minecraft:air');
            expect(lying()).toEqual([]);
        });
    });

    describe('breeding', () => {
        it('produces a baby from two sheep in love', async () => {
            const first = live.runtime.spawn('minecraft:sheep', { x: 0.5, y: GROUND_Y, z: 0.5 });
            const second = live.runtime.spawn('minecraft:sheep', { x: 2.5, y: GROUND_Y, z: 0.5 });
            if (first === undefined || second === undefined) throw new Error('the fixture declares no minecraft:sheep');
            live.runtime.setInLove(first.id, 400);
            live.runtime.setInLove(second.id, 400);

            await run(300);

            const babies = live.runtime
                .all()
                .filter((entity) => entity.instance.activeComponentGroups().includes('baby'));
            expect(babies).toHaveLength(1);
            // The lamb is in the world too, not only in the index.
            expect(typesIn(world).filter((type) => type === 'minecraft:sheep')).toHaveLength(3);
        });
    });

    describe('trading', () => {
        it('builds a villager’s offers from the trade table its component names', () => {
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');

            const merchant = live.runtime.merchant(villager);

            expect(merchant?.offers().flatMap((offer) => offer.offer.gives.map((stack) => stack.item))).toEqual([
                'minecraft:emerald'
            ]);
        });

        it('opens a screen for a player and holds the villager still while it is open', async () => {
            const player = addPlayer(2, 0);
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');

            const id = Number(player.getRuntimeId());
            live.runtime.openTrade(villager.body, live.runtime.mobById(id)!);
            await run(3);

            expect(villager.body.tradingPlayer).toBe(id);
            expect(villager.instance.goals.runningGoals()).toContain('minecraft:behavior.trade_with_player');
        });
    });

    describe('summoning', () => {
        /** The `/summon` verb, over the same server the runtime is wired into. */
        const summon = (type: string, at: { x: number; y: number; z: number }, yaw = 0) =>
            entityCommandHost(world.getServer(), new Scoreboard()).summon(type, at, { yaw, pitch: 0 }, {});

        it('summons a mob only a pack declares, with its components running', () => {
            const ref = summon('jsprismarine:dustling', { x: 2.5, y: GROUND_Y, z: 2.5 });

            const dustling = live.runtime.all().find((entity) => entity.identifier === 'jsprismarine:dustling');
            expect(ref?.type).toBe('jsprismarine:dustling');
            expect(dustling).toBeDefined();
            // The spawn event ran, so this is a live component set rather than a bare body.
            expect(dustling?.instance.activeComponentGroups()).toEqual(['settled']);
            expect(dustling?.instance.attributes.get('health')?.max).toBe(6);
            expect(dustling?.instance.goals.names()).toContain('minecraft:behavior.random_stroll');
        });

        it('gives the summoned mob a body the clients are sent, facing where it was told', () => {
            const ref = summon('jsprismarine:dustling', { x: 2.5, y: GROUND_Y, z: 2.5 }, 90);

            const body = world.getEntities().find((entity) => entity.getType() === 'jsprismarine:dustling');
            expect(body).toBeDefined();
            expect(ref?.id).toBe(body?.getRuntimeId().toString());
            expect(body?.getPosition().getX()).toBe(2.5);
            expect(body?.yaw).toBe(90);
        });

        it('summons a vanilla mob through the data path rather than a written class', () => {
            summon('minecraft:cow', { x: 4.5, y: GROUND_Y, z: 4.5 });

            expect(live.runtime.all().map((entity) => entity.identifier)).toEqual(['minecraft:cow']);
            expect(live.bodies.size).toBe(1);
        });

        it('summons the villager Bedrock summons, not the pre-1.11 one', () => {
            // Mojang's `EntityType` enum still lists `villager` and has no `villager_v2`, so
            // the typed name has to be renamed before the registry is asked. Bedrock spawns
            // the current villager, the one with the brain, the professions and the trades.
            const ref = summon('minecraft:villager', { x: 1.5, y: GROUND_Y, z: 1.5 });

            expect(ref?.type).toBe('minecraft:villager_v2');
            expect(live.runtime.all().map((entity) => entity.identifier)).toEqual(['minecraft:villager_v2']);
        });

        it('leaves a Bedrock-only identifier as typed', () => {
            // `villager_v2` is not a Java entity type, so the rename table does not touch it
            // and the spelling a pack would use still works.
            const ref = summon('minecraft:villager_v2', { x: 1.5, y: GROUND_Y, z: 1.5 });

            expect(ref?.type).toBe('minecraft:villager_v2');
        });

        it('summons nothing for an identifier no pack and no class declares', () => {
            expect(summon('jsprismarine:nothing', { x: 0.5, y: GROUND_Y, z: 0.5 })).toBeUndefined();
            expect(live.runtime.all()).toEqual([]);
        });

        it('still builds the written class for an identifier the content has no type for', () => {
            // A lit TNT has a class and no entity file here. It is one of the seven entities
            // whose behavior is not a component set, so `/summon` falls through to the class
            // rather than refusing.
            const ref = summon('minecraft:tnt', { x: 0.5, y: GROUND_Y, z: 0.5 });

            expect(ref?.type).toBe('minecraft:tnt');
            expect(live.runtime.all()).toEqual([]);
        });
    });

    describe('surviving a restart', () => {
        const folders: string[] = [];
        /** Every provider opened here, closed between runs: LevelDB allows one per folder. */
        const providers: LevelDB[] = [];

        afterEach(async () => {
            for (const provider of providers.splice(0)) await provider.disable();
            while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true });
        });

        /**
         * One run of the server over a world folder: a fresh runtime, a fresh
         * world, and a LevelDB provider on the real disk. Called twice over the
         * same folder, it is a restart.
         */
        const session = async (folder: string) => {
            const built = liveWorld();
            const provider = new LevelDB(folder, built.world.getServer());
            providers.push(provider);

            Object.assign(built.world, {
                name: 'roundtrip',
                seed: 1234,
                // Only read for the name in the save log and for a chunk the database
                // has no record of, which is not the one this writes and reads back.
                generator: { generateChunk: (x: number, z: number) => new Chunk(x, z) },
                provider
            });
            provider.setWorld(built.world);
            await provider.enable();

            built.hold(buildOver(built.world, built.runtimes));
            const opened = built.runtimes.at(DIMENSION);
            if (opened === undefined) throw new Error('the content world opened no entity runtime');

            return { world: built.world, live: opened, provider };
        };

        it('brings a data entity back as a data entity, with the state it was saved with', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-roundtrip-'));
            folders.push(folder);

            const first = await session(folder);
            const saved = first.live.runtime.spawn(
                'jsprismarine:dustling',
                { x: 2.5, y: GROUND_Y, z: 3.5 },
                { pool: 'animal' }
            );
            if (saved === undefined) throw new Error('the fixture declares no jsprismarine:dustling');

            // State nothing but the save can carry: two hit points gone, a home, a held
            // item and a breeding cooldown the type's definition says nothing about.
            saved.instance.attributes.set('health', 4);
            saved.body.home = { x: 2, y: GROUND_Y, z: 3 };
            saved.body.carried = 'minecraft:wheat';
            saved.body.breedCooldown = 120;
            saved.body.yaw = 45;

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            const restored = second.live.runtime.all();
            expect(restored).toHaveLength(1);
            expect(restored[0]?.identifier).toBe('jsprismarine:dustling');
            // A data entity rather than a GenericEntity: it has the component set the
            // definition builds, the groups its spawn event added, and its goals.
            expect(restored[0]?.instance.activeComponentGroups()).toEqual(['settled']);
            expect(restored[0]?.instance.goals.names()).toContain('minecraft:behavior.random_stroll');
            expect(restored[0]?.instance.attributes.get('health')?.current).toBe(4);
            expect(restored[0]?.body.home).toEqual({ x: 2, y: GROUND_Y, z: 3 });
            expect(restored[0]?.body.carried).toBe('minecraft:wheat');
            expect(restored[0]?.body.breedCooldown).toBe(120);
            expect(restored[0]?.body.yaw).toBe(45);
            expect(restored[0]?.position).toEqual({ x: 2.5, y: GROUND_Y, z: 3.5 });

            // One body in the world, and it is the restored entity's rather than a
            // second one left behind by the legacy restore.
            expect(typesIn(second.world).filter((type) => type === 'jsprismarine:dustling')).toHaveLength(1);
            expect(second.live.bodies.size).toBe(1);
        });

        it('counts a restored entity against the population pool it was spawned under', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-pool-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 3.5 }, { pool: 'animal' });
            expect(first.live.runtime.poolCount('animal')).toBe(1);

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            expect(second.live.runtime.poolCount('animal')).toBe(1);
        });

        it('restores a brain mob with its brain, not a body with nothing behind it', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-brain-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.runtime.spawn('minecraft:villager_v2', { x: 2.5, y: GROUND_Y, z: 3.5 });

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            const villager = second.live.runtime.all()[0];
            expect(villager?.brainMob?.id).toBe('minecraft:villager');
            expect(villager?.brain).toBeDefined();
        });

        it('displaces the copy level.json rebuilt rather than standing beside it', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-duplicate-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 3.5 });

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            // What `World.enable` rebuilds out of `level.json`: the same mob at the same spot,
            // as a body with no actor NBT behind it. Before the actor record displaced it, the
            // world ended up with two cows and only one of them driven by anything.
            await second.world.addEntity(
                new GenericEntity({
                    identifier: 'minecraft:cow',
                    position: new Position(2.5, GROUND_Y, 3.5, second.world)
                })
            );
            await second.world.loadChunk(0, 0);

            expect(typesIn(second.world).filter((type) => type === 'minecraft:cow')).toHaveLength(1);
            expect(second.live.runtime.all()).toHaveLength(1);
        });

        it('leaves an actor the data path never wrote to the written classes', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-legacy-'));
            folders.push(folder);

            const first = await session(folder);
            // Added straight to the world, the way the legacy entity path does, so the
            // saved actor carries no record of a data entity.
            await first.world.addEntity(
                new ItemEntity({
                    position: new Position(2.5, GROUND_Y, 3.5, first.world),
                    item: undefined
                })
            );

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            expect(second.live.runtime.all()).toEqual([]);
            expect(typesIn(second.world)).toContain('minecraft:item');
        });
    });
});
