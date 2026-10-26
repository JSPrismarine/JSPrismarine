import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { java_entity_attributes } from '@jsprismarine/bedrock-data';
import { MemoryModuleTypes } from '@jsprismarine/entity-brains';
import { Navigator, navigationProfile } from '@jsprismarine/entity-goals';
import { Vector3 } from '@jsprismarine/math';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { Difficulty, Gametype, LevelSoundEvent } from '@jsprismarine/minecraft';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { overlayPackPath } from '../../content/packStack';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import type { ContentEntityAccess } from '../../content/world/adapter';
import { serverWorldSource } from '../../content/world/serverSource';
import { unwiredWorld } from '../../content/world/unwired';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Item } from '../../item/Item';
import { createItemActorPort } from '../../item/actorPort';
import { useItemOnEntity } from '../../item/interaction';
import type ItemManager from '../../item/ItemManager';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { testEntityServer } from '../../testing/entityServer';
import { stub } from '../../testing/stub.test.helper';
import { entityCommandHost } from '../../command/host/entities';
import { Scoreboard } from '../../command/host/scoreboard';
import type WorldManager from '../../world/WorldManager';
import BlockUpdateScheduler from '../../world/BlockUpdateScheduler';
import Chunk from '../../world/chunk/Chunk';
import LevelDB from '../../world/providers/leveldb/LevelDB';
import { Dimensions } from '../../world/Dimension';
import GameRuleManager, { GameRules } from '../../world/GameRuleManager';
import { createEngineWorld } from '../../world/EngineWorld';
import EntityGrid from '../../world/EntityGrid';
import { Position } from '../../world/Position';
import { World } from '../../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../../world/WorldChangeSink';
import { WorldSystems } from '../../world/WorldSystems';
import { DamageSource } from '../DamageSource';
import { Entity } from '../Entity';
import { GenericEntity } from '../GenericEntity';
import { MetadataFlag } from '../Metadata';
import { Item as ItemEntity } from '../other/Item';
import { dataEntityRecordIn } from './persistence';
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

/** The blocks this fixture declares, which are also the whole of its palette. */
const BLOCKS = ['minecraft:air', 'minecraft:stone', 'minecraft:water'] as const;

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
    'minecraft:movement': { value: 0.25 },
    'minecraft:follow_range': { value: 24 },
    'minecraft:collision_box': { width: 0.6, height: 1.8 },
    'minecraft:physics': {},
    'minecraft:navigation.walk': { can_walk: true },
    'minecraft:type_family': { family: ['mob'] }
};

/** The test entities, each carrying the components its behavior needs. */
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
        'minecraft:warden',
        entityFile('minecraft:warden', {
            components: {
                ...MOB_BASE,
                'minecraft:type_family': { family: ['warden', 'monster', 'mob'] }
            }
        })
    ],
    [
        'jsprismarine:projectile_target',
        entityFile('jsprismarine:projectile_target', {
            components: {
                ...MOB_BASE,
                'minecraft:damage_sensor': {
                    triggers: [
                        {
                            cause: 'projectile',
                            deals_damage: 'no',
                            on_damage: {
                                event: 'jsprismarine:player_projectile',
                                filters: { test: 'is_family', subject: 'other', value: 'player' }
                            }
                        }
                    ]
                }
            },
            component_groups: { hit_by_player_projectile: { 'minecraft:mark_variant': { value: 42 } } },
            events: {
                'jsprismarine:player_projectile': {
                    add: { component_groups: ['hit_by_player_projectile'] }
                }
            }
        })
    ],
    [
        'minecraft:arrow',
        entityFile('minecraft:arrow', {
            components: {
                'minecraft:collision_box': { width: 0.25, height: 0.25 },
                'minecraft:physics': {},
                'minecraft:projectile': {
                    gravity: 0.05,
                    on_hit: {
                        impact_damage: {
                            damage: { min: 0, max: 0 },
                            power_multiplier: 2,
                            destroy_on_hit: true
                        },
                        stick_in_ground: { shake_time: 0.35 }
                    }
                }
            }
        })
    ],
    [
        'minecraft:egg',
        entityFile('minecraft:egg', {
            components: {
                'minecraft:collision_box': { width: 0.25, height: 0.25 },
                'minecraft:physics': {},
                'minecraft:projectile': {
                    gravity: 0.03,
                    on_hit: {
                        impact_damage: { damage: { min: 0, max: 0 }, destroy_on_hit: true },
                        spawn_chance: {
                            first_spawn_chance: 1,
                            first_spawn_count: 1,
                            second_spawn_chance: 0,
                            second_spawn_count: 4,
                            spawn_baby: true,
                            spawn_definition: 'minecraft:chicken'
                        },
                        remove_on_hit: {}
                    }
                }
            }
        })
    ],
    [
        'minecraft:chicken',
        entityFile('minecraft:chicken', {
            components: {
                'minecraft:collision_box': { width: 0.4, height: 0.7 },
                'minecraft:health': { value: 4, max: 4 },
                'minecraft:physics': {},
                'minecraft:type_family': { family: ['chicken', 'mob'] }
            },
            component_groups: { baby: { 'minecraft:is_baby': {} } },
            events: { 'minecraft:entity_born': { add: { component_groups: ['baby'] } } }
        })
    ],
    [
        'jsprismarine:dragon_death_fixture',
        entityFile('jsprismarine:dragon_death_fixture', {
            components: {
                'minecraft:health': { value: 200, max: 200 },
                'minecraft:collision_box': { width: 3, height: 3 },
                'minecraft:physics': { has_gravity: false, has_collision: false },
                'minecraft:on_death': { event: 'jsprismarine:start_death', target: 'self' }
            },
            component_groups: { death: { 'minecraft:behavior.dragondeath': { priority: 0 } } },
            events: { 'jsprismarine:start_death': { add: { component_groups: ['death'] } } }
        })
    ],
    [
        'jsprismarine:egg_layer',
        entityFile('jsprismarine:egg_layer', {
            components: {
                'minecraft:health': { value: 10, max: 10 },
                'minecraft:collision_box': { width: 0.6, height: 1.8 },
                'minecraft:spawn_entity': {
                    entities: {
                        min_wait_time: 0.05,
                        max_wait_time: 0.05,
                        spawn_item_event: { event: 'jsprismarine:egg_spawned', target: 'self' },
                        single_use: true
                    }
                }
            },
            component_groups: { egg_spawned: { 'minecraft:is_baby': {} } },
            events: { 'jsprismarine:egg_spawned': { add: { component_groups: ['egg_spawned'] } } }
        })
    ],
    [
        'jsprismarine:child_spawner',
        entityFile('jsprismarine:child_spawner', {
            components: {
                'minecraft:health': { value: 10, max: 10 },
                'minecraft:collision_box': { width: 0.6, height: 1.8 },
                'minecraft:spawn_entity': {
                    entities: {
                        min_wait_time: 0,
                        max_wait_time: 0,
                        num_to_spawn: 2,
                        spawn_entity: 'minecraft:chicken',
                        spawn_event: 'minecraft:entity_born',
                        single_use: true
                    }
                }
            }
        })
    ],
    [
        'minecraft:piglin',
        entityFile('minecraft:piglin', {
            components: {
                ...MOB_BASE,
                'minecraft:type_family': { family: ['piglin', 'monster', 'mob'] }
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
    ],
    [
        'jsprismarine:levitator',
        entityFile('jsprismarine:levitator', {
            components: {
                ...MOB_BASE,
                'minecraft:physics': { has_gravity: false }
            }
        })
    ],
    [
        'jsprismarine:pet_fixture',
        entityFile('jsprismarine:pet_fixture', {
            components: {
                ...MOB_BASE,
                'minecraft:tameable': {
                    probability: 1,
                    tame_items: ['bone'],
                    tame_event: { event: 'jsprismarine:on_tame', target: 'self' }
                }
            },
            component_groups: { tamed: { 'minecraft:is_tamed': {} } },
            events: { 'jsprismarine:on_tame': { add: { component_groups: ['tamed'] } } }
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

/** A player standing at a position, reserving its id from the server's shared counter. */
const playerAt = (world: World, x: number, z: number): Player => {
    Entity.runtimeIdCount += 1n;
    return Object.assign(Object.create(Player.prototype), {
        position: new Position(x, GROUND_Y, z, world),
        pitch: 0,
        yaw: 0,
        headYaw: 0,
        runtimeId: Entity.runtimeIdCount,
        // The world only hands out players it believes are still connected.
        connected: true,
        server: world.getServer(),
        metadata: { sprinting: false },
        attributes: { getValue: () => 20, setValue: () => true, getAttribute: () => null }
    });
};

/** What the fixture records instead of putting it on a wire. */
interface Broadcasts {
    readonly moved: string[];
    readonly actorSounds: Array<{ identifier: string; entityId: bigint; sound: LevelSoundEvent }>;
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
    const broadcasts: Broadcasts = { moved: [], actorSounds: [] };
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
        // `loadChunk` joins a load already in flight through this, and a world built on the
        // prototype never ran the constructor that would have made it.
        loading: new Map(),
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
        entityMoved: (entity) => void broadcasts.moved.push(entity.getType()),
        actorSound: (entity, sound) =>
            void broadcasts.actorSounds.push({
                identifier: entity.getType(),
                entityId: entity.getRuntimeId(),
                sound
            })
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
            [
                'minecraft:leather',
                'minecraft:wheat',
                'minecraft:emerald',
                'minecraft:cobblestone',
                'minecraft:egg'
            ].includes(definition.identifier)
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

    it('routes entity taming through the live item interaction and consumes one item', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:bone' }), count: 1 }));
        const pet = live.runtime.spawn('jsprismarine:pet_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (pet === undefined) throw new Error('the fixture declares no tameable pet');
        await run(1);

        const body = live.bodies.bodyOf(pet.id);
        if (body === undefined) throw new Error('the tameable pet has no client-facing body');
        const actors = createItemActorPort({
            world: () => world,
            entities: stub<ContentEntityAccess>({ drop: () => undefined }),
            level: unwiredWorld().level,
            interactWithEntity: (target, owner, item) => live.interactWithItem(target, owner, item)
        });
        const result = useItemOnEntity({
            content: live.runtime.content(),
            actors,
            player,
            target: { identifier: pet.identifier, runtimeId: Number(body.getRuntimeId()) }
        });

        expect(result).toBe('handled');
        expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(0);
        expect(pet.body.owner).toBe(Number(player.getRuntimeId()));

        await live.tick(2);

        expect(pet.instance.hasComponent('minecraft:is_tamed')).toBe(true);
        expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.TAMED))).toBe(true);
    });

    it('launches a player projectile through the live data-driven runtime', async () => {
        const player = addPlayer(8, 0);
        Object.assign(player, { position: new Position(8, GROUND_Y + 1.62, 0, world) });
        const target = live.runtime.spawn('minecraft:warden', { x: 8.5, y: GROUND_Y, z: 4.5 });
        if (target === undefined) throw new Error('the fixture declares no minecraft:warden');
        const startingHealth = target.instance.attributes.get('health')?.current;
        if (startingHealth === undefined) throw new Error('the fixture warden has no health attribute');
        const identifier = 'minecraft:player';
        const runtimeId = Number(player.getRuntimeId());

        live.runtime.content().world.itemActions.perform({
            kind: 'launch-projectile',
            identifier: 'minecraft:arrow',
            source: { identifier, runtimeId },
            power: 3,
            inaccuracy: 0,
            data: { critical: true }
        });

        const arrow = live.runtime.all().find((entity) => entity.identifier === 'minecraft:arrow');
        if (arrow === undefined) throw new Error('the item action did not spawn its arrow in the data runtime');
        const arrowBody = live.bodies.bodyOf(arrow.id);
        if (arrowBody === undefined) throw new Error('the data-driven arrow has no live body');

        expect(arrow.spawnData).toEqual({ critical: true });
        expect(arrow.body.owner).toBe(runtimeId);
        expect(arrow.body.velocity.z).toBeGreaterThan(0);
        expect(arrowBody.getTrackingInterval()).toBe(1);

        await run(1);
        expect(arrow.body.velocity.y).toBeCloseTo(-0.0495);

        await run(1);

        expect(target.instance.attributes.get('health')?.current).toBeLessThan(startingHealth);
        expect(live.runtime.byId(arrow.id)).toBeUndefined();
    });

    it('runs the target damage sensor with the projectile owner as its damager', async () => {
        const player = addPlayer(8, 0);
        Object.assign(player, { position: new Position(8, GROUND_Y + 1.62, 0, world) });
        const target = live.runtime.spawn('jsprismarine:projectile_target', {
            x: 8.5,
            y: GROUND_Y,
            z: 4.5
        });
        if (target === undefined) throw new Error('the fixture declares no projectile target');

        live.runtime.content().world.itemActions.perform({
            kind: 'launch-projectile',
            identifier: 'minecraft:arrow',
            source: { identifier: 'minecraft:player', runtimeId: Number(player.getRuntimeId()) },
            power: 3,
            inaccuracy: 0
        });

        await run(4);

        expect(target.instance.attributes.get('health')?.current).toBe(20);
        expect(target.instance.componentParams('minecraft:mark_variant')).toBe(42);
    });

    it('routes a mob shot through the projectile component runtime', async () => {
        const shooter = live.runtime.spawn('minecraft:warden', { x: 8.5, y: GROUND_Y, z: 0.5 });
        const target = live.runtime.spawn('minecraft:warden', { x: 8.5, y: GROUND_Y, z: 5 });
        if (shooter === undefined || target === undefined)
            throw new Error('the fixture declares no warden for the projectile test');
        const startingHealth = target.instance.attributes.get('health')?.current;
        if (startingHealth === undefined) throw new Error('the fixture target has no health attribute');
        const targetMob = live.runtime.mobById(target.id);
        if (targetMob === undefined) throw new Error('the fixture target has no goal view');

        live.runtime.shoot(shooter.body, targetMob, 'minecraft:arrow');
        const arrow = live.runtime.all().find((entity) => entity.identifier === 'minecraft:arrow');
        if (arrow === undefined) throw new Error('the mob shot did not create its arrow in the data runtime');

        await run(4);

        expect(target.instance.attributes.get('health')?.current).toBeLessThan(startingHealth);
        expect(live.runtime.byId(arrow.id)).toBeUndefined();
    });

    it('stops and sticks an arrow at a solid block from its component data', async () => {
        const chunk = world.getLoadedChunk(0, 0);
        if (chunk == null) throw new Error('the projectile test chunk was not loaded');
        chunk.setBlockRuntimeId(8, GROUND_Y + 1, 2, idOf('minecraft:stone'));

        const player = addPlayer(8, 0);
        Object.assign(player, { position: new Position(8.5, GROUND_Y + 1.62, 0.5, world) });
        live.runtime.content().world.itemActions.perform({
            kind: 'launch-projectile',
            identifier: 'minecraft:arrow',
            source: { identifier: 'minecraft:player', runtimeId: Number(player.getRuntimeId()) },
            power: 3,
            inaccuracy: 0
        });

        const arrow = live.runtime.all().find((entity) => entity.identifier === 'minecraft:arrow');
        if (arrow === undefined) throw new Error('the arrow launch action produced no data entity');

        await run(1);

        expect(arrow.position.z).toBeLessThan(2);
        expect(arrow.body.velocity).toEqual({ x: 0, y: 0, z: 0 });
        expect(live.runtime.byId(arrow.id)).toBe(arrow);
    });

    it('hatches an egg using the projectile definition on impact', async () => {
        const player = addPlayer(8, 0);
        Object.assign(player, { position: new Position(8, GROUND_Y + 1.62, 0, world) });
        const target = live.runtime.spawn('minecraft:warden', { x: 8.5, y: GROUND_Y, z: 4.5 });
        if (target === undefined) throw new Error('the fixture declares no minecraft:warden');

        live.runtime.content().world.itemActions.perform({
            kind: 'launch-projectile',
            identifier: 'minecraft:egg',
            source: { identifier: 'minecraft:player', runtimeId: Number(player.getRuntimeId()) },
            power: 1.5,
            inaccuracy: 0
        });

        await run(4);

        const chick = live.runtime.all().find((entity) => entity.identifier === 'minecraft:chicken');
        if (chick === undefined) throw new Error('the egg hit action did not spawn its chicken');
        expect(chick.instance.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('spawns an item from the active spawn_entity component only once', async () => {
        const layer = live.runtime.spawn('jsprismarine:egg_layer', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (layer === undefined) throw new Error('the fixture declares no egg layer');

        await run(5);

        const drops = world
            .getEntities()
            .filter((entity) => entity instanceof ItemEntity)
            .map((entity) => entity.getItem()?.getItem().getName());
        expect(drops).toEqual(['minecraft:egg']);
        expect(layer.instance.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('spawns the configured entity count with the named spawn event', async () => {
        const spawner = live.runtime.spawn('jsprismarine:child_spawner', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (spawner === undefined) throw new Error('the fixture declares no child spawner');

        await run(1);

        const chicks = live.runtime.all().filter((entity) => entity.identifier === 'minecraft:chicken');
        expect(chicks).toHaveLength(2);
        expect(chicks.every((chick) => chick.instance.hasComponent('minecraft:is_baby'))).toBe(true);
    });

    it('lets gravity carry a mob into water instead of treating the water surface as ground', async () => {
        const chunk = world.getLoadedChunk(0, 0);
        if (!chunk) throw new Error('the water test chunk was not loaded');
        chunk.setBlockRuntimeId(0, FLOOR_Y, 0, idOf('minecraft:water'));

        const mob = live.runtime.spawn('minecraft:warden', { x: 0.5, y: GROUND_Y, z: 0.5 });
        if (mob === undefined) throw new Error('the fixture declares no minecraft:warden');

        await live.tick(1);

        expect(mob.position.y).toBeLessThan(GROUND_Y);
    });

    describe('spawning', () => {
        it('restores entity-specific spawn data from the live actor record', () => {
            const data = { variant: 'warm', fuse: 37 };
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 }, { data });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const body = live.bodies.bodyOf(cow.id);
            if (body === undefined) throw new Error('the data-driven cow has no client-facing body');

            live.bodies.persist(live.runtime);
            if (body.persistentNbt === null) throw new Error('the cow has no saved actor data');
            const record = dataEntityRecordIn(body.persistentNbt);
            if (record === undefined) throw new Error('the saved cow record could not be read back');

            const restored = live.runtime.restore(record, cow.position);

            expect(restored?.spawnData).toEqual(data);
        });

        it('routes spawn egg entity actions through the live data runtime', async () => {
            for (const [identifier, x] of [
                ['minecraft:zombie', 2],
                ['minecraft:villager_v2', 4]
            ] as const) {
                live.runtime.content().world.itemActions.perform({
                    kind: 'spawn-entity',
                    identifier,
                    position: { x, y: GROUND_Y + 4, z: 2 }
                });
            }

            const zombie = live.runtime.all().find((entity) => entity.identifier === 'minecraft:zombie');
            if (zombie === undefined) throw new Error('the spawn egg action bypassed the data runtime');
            const villager = live.runtime.all().find((entity) => entity.identifier === 'minecraft:villager_v2');
            if (villager === undefined) throw new Error('the villager spawn egg action bypassed the data runtime');

            expect(villager.brain).toBeDefined();

            await run(30);

            expect(zombie.position.y).toBe(GROUND_Y);
            expect(villager.position.y).toBe(GROUND_Y);
            expect(typesIn(world)).toContain('minecraft:zombie');
            expect(typesIn(world)).toContain('minecraft:villager_v2');
        });

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

        it('does not report an unsupported gravity-free mob as grounded', async () => {
            const levitator = live.runtime.spawn('jsprismarine:levitator', {
                x: 2.5,
                y: GROUND_Y + 4,
                z: 2.5
            });
            if (levitator === undefined) throw new Error('the fixture declares no gravity-free mob');

            await run(1);

            expect(live.bodies.bodyOf(levitator.id)?.isOnGround()).toBe(false);
            expect(live.bodies.bodyOf(levitator.id)?.metadata.affectedByGravity).toBe(false);
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
        it('keeps creative players out of zombie combat targets across game-mode changes', async () => {
            const player = addPlayer(1, 0);
            player.gamemode = Gametype.CREATIVE;
            const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');

            await run(20);
            expect(zombie.target).toBeUndefined();

            player.gamemode = Gametype.SURVIVAL;
            await run(20);
            expect(zombie.target).toBe(Number(player.getRuntimeId()));

            player.gamemode = Gametype.CREATIVE;
            await run(20);
            const playerView = live.runtime.mobById(Number(player.getRuntimeId()));
            if (playerView === undefined) throw new Error('the live runtime cannot see its player');
            expect(playerView.identifier?.()).toBe('minecraft:player');
            expect(zombie.target).toBeUndefined();
        });

        it('drops a piglin combat target when its player switches to creative', async () => {
            const player = addPlayer(12, 0);
            player.gamemode = Gametype.SURVIVAL;
            const piglin = live.runtime.spawn('minecraft:piglin', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (piglin?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:piglin');

            let tick = 0;
            const runUntil = async (predicate: () => boolean): Promise<boolean> => {
                for (let attempt = 0; attempt < 100; attempt += 1) {
                    await live.tick(++tick);
                    if (predicate()) return true;
                }
                return false;
            };

            expect(
                await runUntil(
                    () => piglin.brain?.getMemory(MemoryModuleTypes.ATTACK_TARGET)?.id === String(player.getRuntimeId())
                )
            ).toBe(true);

            player.gamemode = Gametype.CREATIVE;
            expect(await runUntil(() => piglin.brain?.getMemory(MemoryModuleTypes.ATTACK_TARGET) === undefined)).toBe(
                true
            );
        });

        it('keeps a warden from targeting a creative player through its entity sensor', async () => {
            const player = addPlayer(1, 0);
            player.gamemode = Gametype.CREATIVE;
            const warden = live.runtime.spawn('minecraft:warden', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (warden?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:warden');

            let tick = 0;
            const seesPlayer = () =>
                warden.brain
                    ?.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)
                    ?.some((entity) => entity.id === String(player.getRuntimeId())) === true;
            const runUntil = async (predicate: () => boolean): Promise<boolean> => {
                for (let attempt = 0; attempt < 100; attempt += 1) {
                    await live.tick(++tick);
                    if (predicate()) return true;
                }
                return false;
            };

            expect(await runUntil(seesPlayer)).toBe(true);
            expect(warden.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBeUndefined();

            player.gamemode = Gametype.SURVIVAL;
            expect(
                await runUntil(
                    () =>
                        warden.brain?.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)?.id ===
                        String(player.getRuntimeId())
                )
            ).toBe(true);

            player.gamemode = Gametype.CREATIVE;
            expect(
                await runUntil(
                    () => seesPlayer() && warden.brain?.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE) === undefined
                )
            ).toBe(true);
            expect(warden.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBeUndefined();
        });

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

        it('moves overlapping zombies out of a crowd instead of piling up', async () => {
            const player = addPlayer(8, 0);
            const zombies = Array.from({ length: 18 }, (_, index) => {
                const zombie = live.runtime.spawn('minecraft:zombie', {
                    x: 0.5 + (index % 6) * 0.12,
                    y: GROUND_Y,
                    z: 0.5 + Math.floor(index / 6) * 0.12
                });
                if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');
                return zombie;
            });

            await run(60);

            const positions = new Set(
                zombies.map(({ position }) => `${position.x.toFixed(2)},${position.z.toFixed(2)}`)
            );
            expect(zombies.every((zombie) => zombie.target === Number(player.getRuntimeId()))).toBe(true);
            expect(positions.size).toBeGreaterThan(12);
            expect(zombies.some((zombie) => zombie.position.x > 4)).toBe(true);
        });

        it('separates zombies spawned at the exact same position', async () => {
            const player = addPlayer(8, 0);
            const zombies = Array.from({ length: 18 }, () => {
                const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');
                return zombie;
            });

            await run(60);

            const positions = new Set(
                zombies.map(({ position }) => `${position.x.toFixed(2)},${position.z.toFixed(2)}`)
            );
            expect(zombies.every((zombie) => zombie.target === Number(player.getRuntimeId()))).toBe(true);
            expect(positions.size).toBeGreaterThan(12);
            expect(zombies.some((zombie) => zombie.position.x > 4)).toBe(true);
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

        it('runs a data-defined death event before removing the entity after its death behavior', async () => {
            const dragon = live.runtime.spawn('jsprismarine:dragon_death_fixture', {
                x: 8.5,
                y: GROUND_Y + 20,
                z: 8.5
            });
            if (dragon === undefined) throw new Error('the fixture declares no death animator');

            live.runtime.hurt(dragon, undefined, 'entity_attack', 200);
            await run(1);

            expect(dragon.instance.hasComponent('minecraft:behavior.dragondeath')).toBe(true);
            expect(live.runtime.all()).toContain(dragon);

            await run(198);
            expect(live.runtime.all()).toContain(dragon);

            await run(1);
            expect(live.runtime.all()).not.toContain(dragon);
        });

        it('shoves the mob away from whoever hit it', async () => {
            // The body is a `GenericEntity`, which has no velocity of its own, so a sword used
            // to take a cow's health away and leave it standing exactly where it was.
            const cow = live.runtime.spawn('minecraft:cow', { x: 4.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);

            const puncher = playerAt(world, 0, 0.5);
            await live.bodies.bodyOf(cow.id)!.damage(1, DamageSource.entity(puncher));

            expect(cow.body.velocity.x).toBeGreaterThan(0);
            expect(cow.body.velocity.y).toBeGreaterThan(0);

            const before = cow.position.x;
            await run(1);
            expect(cow.position.x).toBeGreaterThan(before);
        });

        it('carries a blow dealt to the body back into the runtime', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);

            await live.bodies.bodyOf(cow.id)!.damage(4);
            await run(1);

            expect(cow.instance.attributes.get('health')?.current).toBe(6);
        });

        it('sends a data-driven mob hurt sound with the mob identity', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);

            const body = live.bodies.bodyOf(cow.id);
            if (body === undefined) throw new Error('the data-driven cow has no client-facing body');
            await body.damage(1);

            expect(broadcasts.actorSounds).toEqual([
                { identifier: 'minecraft:cow', entityId: body.getRuntimeId(), sound: LevelSoundEvent.HURT }
            ]);
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
                seed: 1234n,
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

        it('migrates a pre-runtime mob from its saved actor and resumes gravity and goals', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-migrate-'));
            folders.push(folder);

            const first = await session(folder);
            await first.world.addEntity(
                new GenericEntity({
                    identifier: 'minecraft:zombie',
                    position: new Position(2.5, GROUND_Y + 4, 3.5, first.world)
                })
            );

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            const zombie = second.live.runtime.all().find((entity) => entity.identifier === 'minecraft:zombie');
            if (zombie === undefined) throw new Error('the saved legacy zombie was not migrated into the runtime');
            expect(zombie.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');

            for (let tick = 1; tick <= 30; tick += 1) await second.live.tick(tick);

            expect(zombie.position.y).toBe(GROUND_Y);
            expect(typesIn(second.world).filter((type) => type === 'minecraft:zombie')).toHaveLength(1);
        });

        it('restores level.json mobs into the runtime before their chunks are loaded', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-level-migrate-'));
            folders.push(folder);

            const setup = liveWorld();
            setup.hold(buildOver(setup.world, setup.runtimes));
            const provider = new LevelDB(folder, setup.world.getServer());
            providers.push(provider);

            Object.assign(setup.world, {
                name: 'roundtrip',
                seed: 1234n,
                generator: { generateChunk: (x: number, z: number) => new Chunk(x, z) },
                provider,
                getLevelData: async () => ({
                    entities: [
                        {
                            type: 'minecraft:zombie',
                            position: { x: 2.5, y: GROUND_Y + 4, z: 3.5, yaw: 90, pitch: 12 }
                        }
                    ]
                }),
                prepareStartRegion: async () => {}
            });

            await setup.world.enable();

            const zombie = setup.runtimes.at(DIMENSION)?.runtime.all()[0];
            expect(zombie?.identifier).toBe('minecraft:zombie');
            expect(zombie?.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');
            expect(zombie?.body.yaw).toBe(90);
            expect(zombie?.body.pitch).toBe(12);

            const live = setup.runtimes.at(DIMENSION);
            if (live === undefined) throw new Error('the content world opened no entity runtime');
            for (let tick = 1; tick <= 30; tick += 1) await live.tick(tick);

            expect(zombie?.position.y).toBe(GROUND_Y);
            expect(typesIn(setup.world).filter((type) => type === 'minecraft:zombie')).toHaveLength(1);
        });

        it('displaces the copy level.json rebuilt rather than standing beside it', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-duplicate-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 3.5 });

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            // What `World.enable` rebuilds from `level.json`: a data-driven copy at the same
            // spot, without the actor record's saved component state. Loading the chunk must
            // replace both its body and its runtime entity with the persisted one.
            second.live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 3.5 });
            await second.world.loadChunk(0, 0);

            expect(typesIn(second.world).filter((type) => type === 'minecraft:cow')).toHaveLength(1);
            expect(second.live.runtime.all()).toHaveLength(1);
            expect(second.live.bodies.size).toBe(1);
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
                    item: new ContainerEntry({ item: new Item({ name: 'minecraft:stone' }), count: 1 })
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

    describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('over the vanilla entity definitions', () => {
        const useVanillaContent = (): void => {
            const setup = liveWorld();
            world = setup.world;
            runtimes = setup.runtimes;
            world.getGameRuleManager().setGameRule(GameRules.DoMobSpawning, false, true);

            let built: ServerContent | undefined;
            built = buildServerContent({
                seed: 1234n,
                world: serverWorldSource({
                    worldFor: () => world,
                    content: () => built!,
                    seed: 1234n,
                    difficulty: () => Difficulty.NORMAL,
                    entityRuntimes: runtimes
                })
            });
            setup.hold(built);

            const opened = runtimes.at(DIMENSION);
            if (opened === undefined) throw new Error('the vanilla content opened no entity runtime');
            live = opened;
        };

        it('materializes every loaded entity definition through the live runtime', { timeout: 180_000 }, () => {
            useVanillaContent();

            const failures: string[] = [];
            let index = 0;
            for (const [identifier] of live.runtime.content().entities.registry) {
                const position = {
                    x: 4.5 + (index % 12) * 4,
                    y: GROUND_Y,
                    z: 4.5 + Math.floor(index / 12) * 4
                };
                index += 1;

                const entity = live.runtime.spawn(
                    identifier,
                    position,
                    identifier === 'minecraft:falling_block' ? { data: { block: 'minecraft:stone' } } : undefined
                );
                if (entity === undefined) {
                    failures.push(`${identifier}: runtime did not create an entity`);
                    continue;
                }
                if (live.bodies.bodyOf(entity.id) === undefined) failures.push(`${identifier}: no live actor body`);
            }

            expect(failures).toEqual([]);
        });

        it('spawns and lands falling blocks through the live runtime', async () => {
            useVanillaContent();

            const id = live.runtime
                .content()
                .world.blockWorld.at(DIMENSION)
                .spawnEntity({ x: 2, y: GROUND_Y + 4, z: 2 }, 'minecraft:falling_block', { block: 'minecraft:stone' });
            const fallingBlock = live.runtime.byId(id);
            const body = live.bodies.bodyOf(id);

            expect(fallingBlock?.identifier).toBe('minecraft:falling_block');
            expect(fallingBlock?.spawnData).toEqual({ block: 'minecraft:stone' });
            expect(fallingBlock?.facts.box).toEqual({ width: 0.98, height: 0.98 });
            expect(body?.metadata.affectedByGravity).toBe(true);
            expect(body?.metadata.collidable).toBe(false);
            expect(body?.metadata.getPropertyValue(MetadataFlag.VARIANT)).toBe(idOf('minecraft:stone'));

            for (let tick = 1; tick <= 40; tick += 1) await live.tick(tick);

            expect((await world.getBlockState(2, GROUND_Y, 2)).name).toBe('minecraft:stone');
            expect(live.runtime.byId(id)).toBeUndefined();
            expect(live.bodies.bodyOf(id)).toBeUndefined();
        });

        it(
            'runs spawn egg actions for water, ground, and brain mobs with vanilla components',
            { timeout: 180_000 },
            async () => {
                useVanillaContent();

                // Water replaces the two water spawns' floor blocks. Keep the pursuer on dry land so
                // its chase assertion tests the vanilla goal rather than a route across water.
                for (const x of [20, 22]) {
                    const chunk = world.getLoadedChunk(x >> 4, 0);
                    if (chunk === null) throw new Error(`the vanilla entity test chunk for x=${x} was not loaded`);
                    chunk.setBlockRuntimeId(x & 15, FLOOR_Y, 2, idOf('minecraft:water'));
                }

                const player = addPlayer(8, 2);
                for (const [identifier, x] of [
                    ['minecraft:zombie', 2],
                    ['minecraft:villager_v2', 40],
                    ['minecraft:pig', 20],
                    ['minecraft:zombie', 22]
                ] as const) {
                    live.runtime.content().world.itemActions.perform({
                        kind: 'spawn-entity',
                        identifier,
                        position: {
                            x: x + 0.5,
                            y: identifier === 'minecraft:villager_v2' ? GROUND_Y + 4 : GROUND_Y,
                            z: 2.5
                        }
                    });
                }

                const villager = live.runtime.all().find((entity) => entity.identifier === 'minecraft:villager_v2');
                if (villager === undefined)
                    throw new Error('the vanilla villager spawn egg action bypassed the data runtime');
                const zombies = live.runtime.all().filter((entity) => entity.identifier === 'minecraft:zombie');
                const zombie = zombies.find((entity) => entity.position.x < 5);
                if (zombie === undefined)
                    throw new Error('the vanilla zombie spawn egg action bypassed the data runtime');
                const waterZombie = zombies.find((entity) => entity.position.x > 22);
                if (waterZombie === undefined)
                    throw new Error('the vanilla water zombie spawn egg action bypassed the data runtime');
                const pig = live.runtime.all().find((entity) => entity.identifier === 'minecraft:pig');
                if (pig === undefined) throw new Error('the vanilla pig spawn egg action bypassed the data runtime');
                expect(villager.brain).toBeDefined();
                expect(waterZombie.facts.underwaterMovement).toBeLessThan(waterZombie.facts.movement);

                await live.tick(1);
                expect(zombie.position.y).toBe(GROUND_Y);
                expect(waterZombie.position.y).toBeLessThan(GROUND_Y);
                expect(pig.position.y).toBeLessThan(GROUND_Y);
                for (let tick = 2; tick <= 30; tick += 1) await live.tick(tick);

                expect(zombie.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');
                expect(zombie.target).toBe(Number(player.getRuntimeId()));
                expect(zombie.position.x).toBeGreaterThan(6);
                expect(zombie.position.y).toBe(GROUND_Y);
                expect(waterZombie.position.y).toBeLessThan(GROUND_Y);
                expect(pig.position.y).toBeLessThan(GROUND_Y);
                expect(villager.position.y).toBe(GROUND_Y);
                expect(typesIn(world)).toContain('minecraft:zombie');
                expect(typesIn(world)).toContain('minecraft:villager_v2');
            }
        );

        it('uses Java-owned attributes when the live runtime builds vanilla entities', () => {
            useVanillaContent();

            const wither = live.runtime.spawn('minecraft:wither', { x: 2.5, y: GROUND_Y, z: 2.5 });
            if (wither === undefined) throw new Error('the vanilla content declares no wither');

            expect(wither.facts.health).toBe(
                java_entity_attributes['minecraft:wither']?.attributes['minecraft:max_health']
            );
            expect(wither.facts.health).toBe(300);
        });

        it('uses each vanilla mob’s float goal with liquid physics', async () => {
            useVanillaContent();

            const chunk = world.getLoadedChunk(0, 0);
            if (chunk === null) throw new Error('the vanilla water test chunk was not loaded');
            for (let x = 4; x <= 6; x += 1) {
                for (let z = 4; z <= 6; z += 1) {
                    for (let y = FLOOR_Y - 2; y <= FLOOR_Y; y += 1) {
                        chunk.setBlockRuntimeId(x, y, z, idOf('minecraft:water'));
                    }
                }
            }
            for (let x = 8; x <= 10; x += 1) {
                for (let z = 4; z <= 6; z += 1) {
                    for (let y = FLOOR_Y - 2; y <= FLOOR_Y; y += 1) {
                        chunk.setBlockRuntimeId(x, y, z, idOf('minecraft:water'));
                    }
                }
            }

            const pig = live.runtime.spawn('minecraft:pig', { x: 5.5, y: FLOOR_Y - 1, z: 5.5 });
            if (pig === undefined) throw new Error('the vanilla content declares no pig');
            const zombie = live.runtime.spawn('minecraft:zombie', { x: 9.5, y: FLOOR_Y - 1, z: 5.5 });
            if (zombie === undefined) throw new Error('the vanilla content declares no zombie');

            for (let tick = 1; tick <= 60; tick += 1) await live.tick(tick);

            expect(pig.body.conditions.has('in_water')).toBe(true);
            expect(pig.instance.goals.names()).toContain('minecraft:behavior.float');
            expect(pig.position.y).toBeGreaterThan(FLOOR_Y + 0.5);
            expect(zombie.body.conditions.has('in_water')).toBe(true);
            expect(zombie.instance.goals.names()).not.toContain('minecraft:behavior.float');
            expect(zombie.position.y).toBeLessThan(FLOOR_Y + 0.5);
        });

        it('floats the vanilla boat through its buoyancy component', async () => {
            useVanillaContent();

            const chunk = world.getLoadedChunk(0, 0);
            if (chunk === null) throw new Error('the vanilla boat test chunk was not loaded');
            for (let x = 4; x <= 6; x += 1) {
                for (let z = 4; z <= 6; z += 1) {
                    chunk.setBlockRuntimeId(x, FLOOR_Y + 1, z, idOf('minecraft:water'));
                }
            }
            const boat = live.runtime.spawn('minecraft:boat', {
                x: 5.5,
                y: FLOOR_Y + 1.7,
                z: 5.5
            });
            if (boat === undefined) throw new Error('the vanilla content declares no boat');

            for (let tick = 1; tick <= 200; tick += 1) await live.tick(tick);

            expect(boat.body.conditions.has('in_water')).toBe(true);
            expect(boat.position.y).toBeGreaterThan(FLOOR_Y + 1.6);
            expect(boat.position.y).toBeLessThan(FLOOR_Y + 1.8);
        });

        it('uses Java ground water costs without treating water as solid support', { timeout: 180_000 }, async () => {
            useVanillaContent();

            // Span every loaded z coordinate so a ground walker has no dry detour.
            for (let chunkZ = -LOADED_RADIUS; chunkZ <= LOADED_RADIUS; chunkZ += 1) {
                for (let x = 4; x <= 8; x += 1) {
                    const chunk = world.getLoadedChunk(x >> 4, chunkZ);
                    if (chunk === null)
                        throw new Error(`the vanilla path test chunk for x=${x}, chunkZ=${chunkZ} was not loaded`);
                    for (let y = FLOOR_Y - 2; y <= FLOOR_Y; y += 1) {
                        for (let z = 0; z < 16; z += 1) {
                            chunk.setBlockRuntimeId(x & 15, y, z, idOf('minecraft:water'));
                        }
                    }
                }
            }

            const pig = live.runtime.spawn('minecraft:pig', { x: 2.5, y: GROUND_Y, z: 2.5 });
            if (pig === undefined) throw new Error('the vanilla content declares no pig');
            expect(navigationProfile(pig.instance).canPathOverWater).toBe(true);
            expect(pig.facts.underwaterMovement).toBeLessThan(pig.facts.movement);

            const navigator = new Navigator({
                actuator: live.runtime.actuatorFor(pig.instance),
                navigation: () => live.runtime.navigation(),
                profile: () => navigationProfile(pig.instance)
            });

            expect(navigator.canReach({ x: 10.5, y: GROUND_Y, z: 2.5 })).toBe(false);

            const swimmingPig = live.runtime.spawn('minecraft:pig', { x: 5.5, y: FLOOR_Y + 0.5, z: 5.5 });
            if (swimmingPig === undefined) throw new Error('the vanilla content declares no second pig');
            await live.tick(1);

            const pigBody = live.bodies.bodyOf(swimmingPig.id);
            if (pigBody === undefined) throw new Error('the swimming pig has no client-facing body');
            expect(swimmingPig.body.conditions.has('in_water')).toBe(true);
            expect(swimmingPig.instance.goals.runningGoals()).toContain('minecraft:behavior.float');
            expect(pigBody.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SWIMMING))).toBe(true);

            const player = addPlayer(10, 2);
            const zombieWalker = live.runtime.spawn('minecraft:zombie', { x: 2.5, y: GROUND_Y, z: 2.5 });
            if (zombieWalker === undefined) throw new Error('the vanilla content declares no zombie');
            expect(navigationProfile(zombieWalker.instance).isAmphibious).toBe(false);
            expect(navigationProfile(zombieWalker.instance).canFloat).toBe(false);
            for (let tick = 2; tick <= 60; tick += 1) await live.tick(tick);

            const body = live.bodies.bodyOf(zombieWalker.id);
            if (body === undefined) throw new Error('the zombie has no client-facing body');
            expect(zombieWalker.target).toBe(Number(player.getRuntimeId()));
            expect(zombieWalker.position.x).toBeLessThan(4);
            expect(zombieWalker.position.y).toBe(GROUND_Y);
            expect(zombieWalker.body.conditions.has('in_water')).toBe(false);
            expect(body.isOnGround()).toBe(true);
            expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SWIMMING))).toBe(false);
        });
    });
});
