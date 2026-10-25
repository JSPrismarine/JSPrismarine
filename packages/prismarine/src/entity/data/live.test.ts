import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

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
import BlockUpdateScheduler from '../../world/BlockUpdateScheduler';
import Chunk from '../../world/chunk/Chunk';
import { Dimensions } from '../../world/Dimension';
import GameRuleManager from '../../world/GameRuleManager';
import { createEngineWorld } from '../../world/EngineWorld';
import EntityGrid from '../../world/EntityGrid';
import { Position } from '../../world/Position';
import { World } from '../../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../../world/WorldChangeSink';
import { WorldSystems } from '../../world/WorldSystems';
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

    const server: Server = Object.assign(testEntityServer(), {
        getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL, getEntityTrackingInterval: () => 20 }),
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
        runtimes: new EntityRuntimes(),
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
            Object.assign(player, { damage: async (amount: number) => void hits.push(amount) || true });

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
});
