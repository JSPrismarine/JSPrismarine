import { isRecord } from '../../utils/isRecord';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import type { Logger } from '@jsprismarine/logger';
import { java_entity_attributes, legacy_item_aux_aliases } from '@jsprismarine/bedrock-data';
import { MemoryModuleTypes } from '@jsprismarine/entity-brains';
import { Navigator, navigationProfile } from '@jsprismarine/entity-goals';
import { Vector3 } from '@jsprismarine/math';
import { Types } from '@jsprismarine/nbt';
import { ActorDataID } from '@jsprismarine/minecraft/ActorDataID';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { ActorEvent, Difficulty, Gametype, LevelSoundEvent } from '@jsprismarine/minecraft';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { entityData, vanillaItemDefinitions } from '@jsprismarine/items';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { RaidRecord } from '../../world/raid/RaidManager';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { overlayPackPath } from '../../content/packStack';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import type { ContentEntityAccess } from '../../content/world/adapter';
import { serverWorldSource } from '../../content/world/serverSource';
import type { ServerWorldHandle } from '../../content/world/serverSource';
import { unwiredWorld } from '../../content/world/unwired';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Item } from '../../item/Item';
import { createItemActorPort } from '../../item/actorPort';
import { useItemOnEntity } from '../../item/interaction';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { testEntityServer } from '../../testing/entityServer';
import { fakeLevel } from '../../testing/level';
import { stub } from '../../testing/stub.test.helper';
import { sessionOnPrototype } from '../../testing/storePlayer.test.helper';
import { moveStorePlayer } from './storePlayers';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { entityCommandHost } from '../../command/host/entities';
import { Scoreboard } from '../../command/host/scoreboard';
import type WorldManager from '../../world/WorldManager';
import type { DimensionTravel } from '../../world/portal/DimensionTravel';
import type { Level } from '../../world/Level';
import BlockUpdateScheduler from '../../world/BlockUpdateScheduler';
import Chunk from '../../world/chunk/Chunk';
import LevelDB from '../../world/providers/leveldb/LevelDB';
import { Dimensions } from '../../world/DimensionType';
import { GameRules } from '../../world/GameRuleManager';
import { createEngineWorld } from '../../world/EngineWorld';
import BlockPhysics from '../../world/physics/BlockPhysics';
import { Position } from '../../world/Position';
import { World } from '../../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../../world/WorldChangeSink';
import { WorldSystems } from '../../world/WorldSystems';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import InventoryTransactionPacket from '@jsprismarine/protocol/packet/InventoryTransactionPacket';
import { HandSlot, ItemUseOnActorActionType, TransactionType } from '@jsprismarine/protocol';
import type PlayerSession from '../../network/PlayerSession';
import { inventoryTransactionToProtocol } from '../../network/InventoryTransactionAdapter';
import Codec2193 from '../../network/codec/Codec2193';
import InventoryTransactionHandler from '../../network/handler/InventoryTransactionHandler';
import { HandlerContexts } from '../../network/handlerContexts';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { meleeAttack } from '../Combat';
import { explode } from '../Explosion';
import { entityIds } from '../entityIds';
import { INERT_ACTOR, InertActor } from './storeActors';
import type { StoreActor } from './storeActors';
import { savedActorNbt } from '../../testing/savedActor.test.helper';
import { EntitySerializer } from '../EntitySerializer';
import { MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { ItemActor as ItemEntity } from './itemActor';
import { itemViewOf } from './droppedItems';
import type { DataEntity } from './DataEntity';
import { ENTITY_FAILURE_LIMIT } from './EntityStore';
import { builtInEntityDefinitions } from '../../content/testing';
import { spawnDeclared } from './testing';
import { loose } from '../Archery';
import type { OpenBlockContainer, OpenTrade } from '../../network/PlayerSession';
import { dataEntityRecordIn, dataEntityRecordOf } from './persistence';
import { EntityRuntimes } from './live';
import type { EntityRef } from '@jsprismarine/commands';
import type { LiveEntityRuntime } from './live';
import type { Generator } from '../../world/Generator';
import type { ChangeEntry } from '../../world/changelog/ChangeEntry';

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
const BLOCKS = ['minecraft:air', 'minecraft:dirt', 'minecraft:stone', 'minecraft:water', 'minecraft:tnt'] as const;

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
        'jsprismarine:sword_immune',
        entityFile('jsprismarine:sword_immune', {
            components: {
                ...MOB_BASE,
                'minecraft:damage_sensor': { triggers: [{ cause: 'entity_attack', deals_damage: 'no' }] }
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
        // The vanilla crystal's shape, trimmed to what the runtime reads: one health,
        // `on_hurt` adding the `crystal_exploding` group whose zero fuse carries power 6
        // and no fire (bedrock-samples 1.26.50, `behavior_pack/entities/ender_crystal.json`).
        'minecraft:ender_crystal',
        entityFile('minecraft:ender_crystal', {
            components: {
                'minecraft:collision_box': { width: 2, height: 2 },
                'minecraft:fire_immune': {},
                'minecraft:health': { value: 1, max: 1 },
                'minecraft:on_hurt': { event: 'minecraft:crystal_explode', target: 'self' },
                'minecraft:physics': {}
            },
            component_groups: {
                crystal_exploding: {
                    'minecraft:explode': {
                        causes_fire: false,
                        fuse_lit: true,
                        power: 6,
                        destroy_affected_by_griefing: true,
                        fuse_length: 0
                    }
                }
            },
            events: {
                'minecraft:crystal_explode': { add: { component_groups: ['crystal_exploding'] } }
            }
        })
    ],
    [
        'minecraft:cushion',
        entityFile('minecraft:cushion', {
            components: {
                'minecraft:collision_box': { width: 0.5, height: 0.25 },
                'minecraft:physics': {}
            }
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
        'minecraft:ender_dragon',
        // The vanilla dragon's shape, trimmed to its kill path
        // (bedrock-samples 1.26.50, `behavior_pack/entities/ender_dragon.json`).
        entityFile('minecraft:ender_dragon', {
            components: {
                'minecraft:health': { value: 200, max: 200 },
                'minecraft:collision_box': { width: 13, height: 4 },
                'minecraft:physics': { has_gravity: false, has_collision: false },
                'minecraft:type_family': { family: ['dragon', 'mob'] },
                'minecraft:on_death': { event: 'minecraft:start_death', target: 'self' }
            },
            component_groups: { dragon_death: { 'minecraft:behavior.dragondeath': { priority: 0 } } },
            events: { 'minecraft:start_death': { add: { component_groups: ['dragon_death'] } } }
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
            component_groups: { baby: { 'minecraft:is_baby': {}, 'minecraft:scale': { value: 0.5 } } },
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
        'jsprismarine:transient_fixture',
        entityFile('jsprismarine:transient_fixture', {
            components: { ...MOB_BASE, 'minecraft:transient': {} }
        })
    ],
    [
        'jsprismarine:pet_fixture',
        entityFile('jsprismarine:pet_fixture', {
            components: {
                ...MOB_BASE,
                'minecraft:healable': { items: [{ item: 'cooked_beef', heal_amount: 4 }] },
                'minecraft:tameable': {
                    probability: 1,
                    tame_items: [{ item: 'bone', result_item: 'stick' }],
                    tame_event: { event: 'jsprismarine:on_tame', target: 'self' }
                }
            },
            component_groups: { tamed: { 'minecraft:is_tamed': {} } },
            events: { 'jsprismarine:on_tame': { add: { component_groups: ['tamed'] } } }
        })
    ],
    [
        'jsprismarine:ageable_fixture',
        entityFile('jsprismarine:ageable_fixture', {
            components: { ...MOB_BASE },
            component_groups: {
                baby: {
                    'minecraft:is_baby': {},
                    'minecraft:ageable': {
                        duration: 2,
                        feed_items: [{ item: 'wheat', growth: 0.5, result_item: 'stick' }],
                        grow_up: { event: 'jsprismarine:ageable_grown', target: 'self' },
                        interact_filters: { test: 'is_baby' }
                    }
                },
                adult: { 'minecraft:type_family': { family: ['adult'] } }
            },
            events: {
                'minecraft:entity_born': { add: { component_groups: ['baby'] } },
                'jsprismarine:ageable_grown': {
                    add: { component_groups: ['adult'] },
                    remove: { component_groups: ['baby'] }
                }
            }
        })
    ],
    [
        'jsprismarine:interact_fixture',
        entityFile('jsprismarine:interact_fixture', {
            components: {
                ...MOB_BASE,
                'minecraft:interact': {
                    interactions: [
                        {
                            on_interact: {
                                filters: {
                                    all_of: [
                                        { test: 'is_family', subject: 'other', value: 'player' },
                                        {
                                            test: 'has_equipment',
                                            subject: 'other',
                                            domain: 'hand',
                                            value: 'stick:0'
                                        }
                                    ]
                                },
                                event: 'jsprismarine:interact_without_use',
                                target: 'self'
                            },
                            use_item: false
                        },
                        {
                            on_interact: {
                                filters: {
                                    all_of: [
                                        { test: 'is_family', subject: 'other', value: 'player' },
                                        {
                                            test: 'has_equipment',
                                            subject: 'other',
                                            domain: 'hand',
                                            value: 'bucket:0'
                                        }
                                    ]
                                },
                                event: 'jsprismarine:interact_used',
                                target: 'self'
                            },
                            use_item: true,
                            transform_to_item: 'bucket:1'
                        },
                        {
                            on_interact: {
                                filters: {
                                    all_of: [
                                        { test: 'is_family', subject: 'other', value: 'player' },
                                        {
                                            test: 'has_equipment_tag',
                                            subject: 'other',
                                            domain: 'hand',
                                            value: 'minecraft:logs'
                                        }
                                    ]
                                },
                                event: 'jsprismarine:tagged_item_interaction',
                                target: 'self'
                            },
                            use_item: false
                        },
                        {
                            on_interact: {
                                filters: {
                                    all_of: [
                                        {
                                            test: 'has_equipment_tag',
                                            subject: 'other',
                                            domain: 'inventory',
                                            value: 'minecraft:logs'
                                        },
                                        {
                                            test: 'has_item_with_component',
                                            subject: 'other',
                                            value: 'minecraft:cooking_fuel'
                                        }
                                    ]
                                },
                                event: 'jsprismarine:inventory_item_interaction',
                                target: 'self'
                            },
                            use_item: false
                        },
                        {
                            play_sounds: 'mob.generic'
                        }
                    ]
                }
            },
            component_groups: { interacted: { 'minecraft:persistent': {} } },
            events: {
                'jsprismarine:interact_used': { add: { component_groups: ['interacted'] } },
                'jsprismarine:interact_without_use': { add: { component_groups: ['interacted'] } },
                'jsprismarine:tagged_item_interaction': { add: { component_groups: ['interacted'] } },
                'jsprismarine:inventory_item_interaction': { add: { component_groups: ['interacted'] } }
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
        'minecraft:blocks/dirt',
        definitionOf('lootTablesJava', 'minecraft:blocks/dirt', {
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

/**
 * A player standing at a position, reserving its id from the server's shared counter, over a
 * store player that `World.addPlayer` enters into the world's store.
 */
const playerAt = (world: World, x: number, z: number, uuid?: string): PlayerSession => {
    const id = entityIds.next();
    const identity = uuid === undefined ? new UUID(0, 0, 0, id) : UUID.fromString(uuid);
    const player = sessionOnPrototype(
        {
            getServer: () => world.getServer(),
            tracks: () => false,
            send: async () => {},
            sendInventory: async () => {},
            getConnection: () =>
                stub<ReturnType<PlayerSession['getConnection']>>({
                    codec: Codec2193,
                    // What the end of a world tick drains, for a test that runs `World.update`.
                    flushOutboundPackets: async () => {}
                })
        },
        { runtimeId: BigInt(id), uuid: identity, position: new Position(x, GROUND_Y + EYE_HEIGHT, z, world) }
    );
    player.getPlayer().gamemode = Gametype.SURVIVAL;
    return player;
};

/**
 * What the fixture records instead of putting it on a wire. Moves and metadata are replicated
 * from the change log, which `NetworkWorldReplicatorEntities.test.ts` covers.
 */
interface Broadcasts {
    readonly actorSounds: Array<{ identifier: string; entityId: bigint; sound: LevelSoundEvent }>;
    readonly actorEffects: Array<{ identifier: string; entityId: bigint; effect: ActorEvent }>;
}

/**
 * A `World` reduced to what the entity runtime touches.
 *
 * Built on the real prototype with real chunks and real `WorldSystems`, so the
 * entity list, the chunk reads and the tick lists are the server's own.
 */
const liveWorld = (
    provider?: LevelDB
): {
    world: World;
    broadcasts: Broadcasts;
    runtimes: EntityRuntimes;
    hold(content: ServerContent): void;
} => {
    const heard: Pick<Broadcasts, 'actorSounds' | 'actorEffects'> = { actorSounds: [], actorEffects: [] };
    /** Seals what the world logged so far, which hands its occurrences to the sink. */
    const seal = () => {
        world.beginChangeTick();
        world.sealChangeTick();
    };
    const broadcasts: Broadcasts = {
        get actorSounds() {
            seal();
            return heard.actorSounds;
        },
        get actorEffects() {
            seal();
            return heard.actorEffects;
        }
    };
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
        getStorePlayers: () => runtimes.players,
        getWorldManager: () =>
            stub<WorldManager>({
                getDefaultWorld: () => world,
                getWorldByDimension: (dimension) => (dimension === Dimensions.Overworld.id ? world : undefined),
                // What `/summon` resolves its dimension through; the one world is already running.
                startWorld: (dimension) => (dimension === Dimensions.Overworld.id ? world : undefined),
                // What a command resolves an entity reference through.
                getLevels: () => [stub<Level>({ worlds: () => [world].values() })]
            }),
        getContent: () => content,
        // So the world's occurrences go into its change log, as a live world's do.
        hasEntityRuntime: () => true
    });

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks,
        // `loadChunk` joins a load already in flight through this, and a world built on the
        // prototype never ran the constructor that would have made it.
        loading: new Map(),
        // A real level double, because a `World` built on its prototype never ran the
        // constructor, and the content level group reads the rules and the clock through it.
        level: fakeLevel({ server, seed: 1234n, spawn: new Vector3(8, GROUND_Y, 8), provider }),
        dimension: Dimensions.Overworld,
        generator: stub<Generator>({}),
        blockUpdates: new BlockUpdateScheduler(),
        players: new Map(),
        server
    });

    world.attachChangeSink({
        ...NULL_WORLD_CHANGE_SINK,
        tickSealed: ({ entries }) => {
            for (const entry of entries) {
                if (entry.kind !== 'occurrence') continue;
                if (entry.occurrence === 'actor-sound')
                    heard.actorSounds.push({
                        identifier: entry.data.type,
                        entityId: entry.data.entity,
                        sound: entry.data.sound
                    });
                if (entry.occurrence === 'actor-event')
                    heard.actorEffects.push({
                        // Read as the tick seals, when the entity is still in the world.
                        identifier: world.getActor(entry.data.entity)?.getType() ?? 'removed',
                        entityId: entry.data.entity,
                        effect: entry.data.event
                    });
            }
        }
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
const buildOver = (
    world: World,
    runtimes: EntityRuntimes,
    keepWorld?: (world: ServerWorldHandle) => void
): ServerContent => {
    let built: ServerContent | undefined;
    const worldSource = serverWorldSource({
        worldFor: () => world,
        content: () => built!,
        seed: 1234n,
        difficulty: () => Difficulty.NORMAL,
        // The seeded source the server itself uses, left alone: a constant draw sends
        // every wander at the same unreachable cell and measures the path finder's
        // failure case rather than the goal.
        entityRuntimes: runtimes
    });
    keepWorld?.(worldSource);
    const content = buildServerContent({
        load: () => ({
            definitions: definitionsOf({
                blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                entities: new Map([...builtInEntityDefinitions(), ...ENTITIES]),
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
                'minecraft:bone',
                'minecraft:stick',
                'minecraft:bucket',
                'minecraft:emerald',
                'minecraft:cobblestone',
                'minecraft:egg',
                'minecraft:chicken_spawn_egg',
                'minecraft:oak_log'
            ].includes(definition.identifier)
        ),
        seed: 1234n,
        world: worldSource
    });
    built = content;
    return content;
};

/** The identifiers of everything in the world, which is what a client would be sent. */
/** The types of every entity a world holds, a store entity through its actor. */
const typesIn = (world: World): string[] => world.getActors().map((entity) => entity.getType());

describe('the data-driven entity runtime over a live world', () => {
    let world: World;
    let broadcasts: Broadcasts;
    let runtimes: EntityRuntimes;
    let live: LiveEntityRuntime;
    let worldSource: ServerWorldHandle;

    beforeEach(() => {
        let hold: (built: ServerContent) => void;
        ({ world, broadcasts, runtimes, hold } = liveWorld());
        hold(buildOver(world, runtimes, (source) => (worldSource = source)));

        const opened = runtimes.at(DIMENSION);
        if (opened === undefined) throw new Error('the content world opened no entity runtime');
        live = opened;
    });

    /** Runs the runtime for a number of ticks, from tick 1. */
    const run = async (ticks: number): Promise<void> => {
        for (let tick = 1; tick <= ticks; tick += 1) await live.tick(tick);
    };

    /** Keeps long-running undead fixtures alive; these direct runtime ticks do not advance Level time. */
    const startAtNight = (): void => world.setTicks(13_000);

    /** Puts a player in the world, which is what the spawner spawns around. */
    const addPlayer = (x: number, z: number, uuid?: string): PlayerSession => {
        const player = playerAt(world, x, z, uuid);
        // Into the player map and the store, as a spawn puts a joined player: `getViewers` reads
        // the one, and a blow finds whoever it landed on through the other.
        void world.addPlayer(player);
        return player;
    };

    /** Uses the player's held item on an entity through its real inventory transaction path. */
    const useHeldItemOnEntity = async (player: PlayerSession, targetRuntimeId: bigint): Promise<void> => {
        const server = player.getServer();
        Object.assign(server, { getContentWorld: () => worldSource });
        const position = player.getPosition();
        const packet = new InventoryTransactionPacket(
            inventoryTransactionToProtocol(
                {
                    legacyRequest: { legacyRequestId: 0, legacySlotChanges: [] },
                    transactionType: TransactionType.USE_ITEM_ON_ENTITY,
                    inventoryActions: [],
                    hand: HandSlot.MAINHAND,
                    transactionData: {
                        kind: 'useItemOnEntity' as const,
                        entityRuntimeId: targetRuntimeId,
                        actionType: ItemUseOnActorActionType.ITEM_INTERACT,
                        hotbarSlot: player.getInventory().getHandSlotIndex(),
                        itemInHand: Item.air(),
                        playerPosition: new Vector3(position.getX(), position.getY(), position.getZ()),
                        clickPosition: new Vector3(0, 0, 0)
                    }
                },
                Codec2193.context
            )
        );

        HandlerContexts.of(server).runInput(new InventoryTransactionHandler(), packet, player, (error) => {
            throw error;
        });
    };

    it('keeps a live player out of chunk saves, chunk changes and the despawn cycle', async () => {
        const player = addPlayer(2, 2);
        const entity = player.getPlayer().entity;
        if (entity === undefined) throw new Error('the player has no entity');
        const chunk = world.getLoadedChunk(1, 0);
        if (chunk === null) throw new Error('the fixture has no chunk at 1, 0');
        chunk.markSaved();

        // Walked into another chunk, which a mob's crossing would mark for the next save.
        moveStorePlayer(live.runtime, player.getPlayer(), {
            position: { x: 20.5, y: GROUND_Y, z: 2.5 },
            yaw: 0,
            pitch: 0,
            onGround: true,
            headYaw: 0
        });
        expect(chunk.getHasChanged()).toBe(false);
        expect([...live.savedRecords().keys()].map((actor) => actor.getType())).not.toContain(PLAYER_IDENTIFIER);

        await run(400);
        expect(live.runtime.byId(entity.id)).toBe(entity);
        expect(entity.removed).toBeUndefined();
    });

    it('reuses the live player filter view while reading current player state', () => {
        const player = addPlayer(0, 0);
        const id = Number(player.getRuntimeId());
        const first = live.runtime.host.playerView?.(id);
        const second = live.runtime.host.playerView?.(id);

        expect(first).toBeDefined();
        expect(second).toBe(first);
        player.getActor()!.addTag('changed-during-runtime');
        expect(first?.names?.('has_tag')).toContain('changed-during-runtime');
    });

    it('queries nearby dropped items by live spatial candidates and keeps exact nearest-first ties', async () => {
        const addItem = async (x: number, y: number, z: number): Promise<DataEntity> => {
            const item = live.dropItem({ x, y, z }, { stack: { name: 'minecraft:wheat', count: 1 }, reported: true });
            if (item === undefined) throw new Error('the fixture declares no dropped item');
            return item;
        };
        const center = { x: 0.5, y: 64, z: 0.5 };
        const firstTie = await addItem(1.5, 64.125, 0.5);
        const secondTie = await addItem(-0.5, 64.125, 0.5);
        const nearest = await addItem(0.5, 64.125, 0.5);
        await addItem(0.5, 67.125, 0.5);

        const found = live.runtime.items(center, 2);

        expect(found.map((item) => item.id)).toEqual([nearest.id, firstTie.id, secondTie.id]);
        expect(found[0]?.position()).toEqual({ x: 0.5, y: 64, z: 0.5 });

        firstTie.position = { x: 32.5, y: 64.125, z: 0.5 };
        live.runtime.remove(secondTie.id, 'merged');

        expect(live.runtime.items(center, 2).map((item) => item.id)).toEqual([nearest.id]);
    });

    it('wires the entity subsystem’s two groups into the content world', () => {
        // Both used to throw `NotWiredError` naming the entity subsystem.
        expect(() => live.runtime.content().world.spawnWorld.players()).not.toThrow();
        expect(live.runtime.content().world.brainWorld()).toBeDefined();
    });

    it('rejects a natural spawn when Java reserves that entity for a structure override', async () => {
        Object.assign(world, {
            generator: Object.assign(stub<Generator>({}), {
                structureSpawnOverrideAt: (identifier: string) => (identifier === 'minecraft:cow' ? false : undefined)
            })
        });
        addPlayer(8, 8);

        await run(400);

        expect(typesIn(world)).not.toContain('minecraft:cow');
    });

    it('gives a data mob one id, which its body carries on the wire', async () => {
        const pet = live.runtime.spawn('jsprismarine:pet_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (pet === undefined) throw new Error('the fixture declares no tameable pet');
        await run(1);

        const body = live.actors.actorOf(pet.id);
        if (body === undefined) throw new Error('the pet has no store actor');
        expect(body.getRuntimeId()).toBe(BigInt(pet.id));
        expect(world.getActor(BigInt(pet.id))).toBe(body);
    });

    it('replaces a successfully used tame item through the live inventory path', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:bone' }), count: 2 }));
        const pet = live.runtime.spawn('jsprismarine:pet_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (pet === undefined) throw new Error('the fixture declares no tameable pet');
        await run(1);

        const body = live.actors.actorOf(pet.id);
        if (body === undefined) throw new Error('the tameable pet has no store actor');
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
        expect(player.getInventory().getItemInHand().getName()).toBe('minecraft:bone');
        expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(1);
        expect(
            player
                .getInventory()
                .getItems()
                .some((entry) => entry.getItem().getName() === 'minecraft:stick' && entry.getCount() === 1)
        ).toBe(true);
        expect(pet.body.owner).toBe(Number(player.getRuntimeId()));

        await live.tick(2);

        expect(pet.instance.hasComponent('minecraft:is_tamed')).toBe(true);
        expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.TAMED))).toBe(true);
    });

    it('reattaches a saved tame to its owner after the owner gets a new runtime id', async () => {
        const ownerUuid = '00000000-0000-0000-0000-000000000042';
        const firstPlayer = addPlayer(2, 2, ownerUuid);
        const pet = live.runtime.spawn('jsprismarine:pet_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (pet === undefined) throw new Error('the fixture declares no tameable pet');

        const body = live.actors.actorOf(pet.id);
        if (body === undefined) throw new Error('the tameable pet has no store actor');
        expect(live.interactWithItem(body, firstPlayer.getActor()!, 'minecraft:bone').accepted).toBe(true);

        live.persist();
        const record = body.persistentNbt === null ? undefined : dataEntityRecordIn(body.persistentNbt);
        if (record === undefined) throw new Error('the tameable pet record was not saved');
        expect(record).toMatchObject({ ownerIdentity: ownerUuid });

        live.runtime.remove(pet.id, 'test restart');
        // The owner logs out, and back in under a new runtime id.
        world.removePlayer(firstPlayer);
        const rejoinedPlayer = addPlayer(4, 4, ownerUuid);
        const at = body.getPosition();
        const restored = live.restoreRecord(
            record,
            { x: at.getX(), y: at.getY(), z: at.getZ() },
            { persistentNbt: body.persistentNbt, tags: [], statusEffects: [] }
        );
        if (restored === undefined) throw new Error('the tameable pet did not restore');

        await live.tick(1);

        expect(restored.body.owner).toBe(Number(rejoinedPlayer.getRuntimeId()));
        expect(restored.instance.filterContext().self.owner?.()?.id?.()).toBe(Number(rejoinedPlayer.getRuntimeId()));
    });

    it('feeds an ageable baby through the live inventory path and applies its result item', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:wheat' }), count: 2 }));
        const baby = live.runtime.spawn(
            'jsprismarine:ageable_fixture',
            { x: 2.5, y: GROUND_Y, z: 2.5 },
            {
                cause: 'born'
            }
        );
        if (baby === undefined) throw new Error('the fixture declares no ageable baby');

        const body = live.actors.actorOf(baby.id);
        if (body === undefined) throw new Error('the ageable baby has no store actor');
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
            target: { identifier: baby.identifier, runtimeId: Number(body.getRuntimeId()) }
        });

        expect(result).toBe('handled');
        expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(1);
        expect(
            player
                .getInventory()
                .getItems()
                .some((entry) => entry.getItem().getName() === 'minecraft:stick' && entry.getCount() === 1)
        ).toBe(true);

        await run(21);

        expect(baby.instance.hasComponent('minecraft:is_baby')).toBe(false);
        expect(baby.instance.hasComponent('minecraft:type_family')).toBe(true);
    });

    it('filters a live player interaction, transforms the held item data, and applies its event', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:bucket' }), count: 1 }));
        const animal = live.runtime.spawn('jsprismarine:interact_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (animal === undefined) throw new Error('the fixture declares no interactable entity');

        const body = live.actors.actorOf(animal.id);
        if (body === undefined) throw new Error('the interactable entity has no store actor');
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
            target: { identifier: animal.identifier, runtimeId: Number(body.getRuntimeId()) }
        });

        expect(result).toBe('handled');
        expect(player.getInventory().getItemInHand().getName()).toBe('minecraft:bucket');
        expect(player.getInventory().getItemInHand().getMeta()).toBe(1);
        expect(animal.instance.hasComponent('minecraft:persistent')).toBe(false);

        await live.tick(1);

        expect(animal.instance.hasComponent('minecraft:persistent')).toBe(true);
    });

    it('passes Bedrock item tags to a live entity interaction filter', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player.getInventory().setItemInHand(
            new ContainerEntry({
                item: new Item({ name: 'minecraft:oak_log', content: live.runtime.content() }),
                count: 1
            })
        );
        const animal = live.runtime.spawn('jsprismarine:interact_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (animal === undefined) throw new Error('the fixture declares no interactable entity');
        const body = live.actors.actorOf(animal.id);
        if (body === undefined) throw new Error('the interactable entity has no store actor');

        expect(player.getInventory().getItemInHand().hasTag('minecraft:logs')).toBe(true);
        expect(live.interactWithItem(body, player.getActor()!, 'minecraft:oak_log').accepted).toBe(true);
        expect(animal.instance.hasComponent('minecraft:persistent')).toBe(false);

        await live.tick(1);

        expect(animal.instance.hasComponent('minecraft:persistent')).toBe(true);
    });

    it('scans a live player inventory for item tags and data components', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player.getInventory().setItemInHand(
            new ContainerEntry({
                item: new Item({ name: 'minecraft:stone', content: live.runtime.content() }),
                count: 1
            })
        );
        player.getInventory().setItem(
            8,
            new ContainerEntry({
                item: new Item({ name: 'minecraft:oak_log', content: live.runtime.content() }),
                count: 1
            })
        );
        const animal = live.runtime.spawn('jsprismarine:interact_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (animal === undefined) throw new Error('the fixture declares no interactable entity');
        const body = live.actors.actorOf(animal.id);
        if (body === undefined) throw new Error('the interactable entity has no store actor');

        expect(live.interactWithItem(body, player.getActor()!, 'minecraft:stone').accepted).toBe(true);
        await live.tick(1);

        expect(animal.instance.hasComponent('minecraft:persistent')).toBe(true);
    });

    it('spawns a spawn egg entity inside an interacted mob even when its interaction accepts the egg', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:chicken_spawn_egg' }), count: 1 }));
        const animal = live.runtime.spawn('jsprismarine:interact_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (animal === undefined) throw new Error('the fixture declares no interactable entity');
        const body = live.actors.actorOf(animal.id);
        if (body === undefined) throw new Error('the interactable entity has no store actor');

        await useHeldItemOnEntity(player, body.getRuntimeId());

        const chicken = live.runtime
            .entities()
            .toArray()
            .find((entity) => entity.identifier === 'minecraft:chicken');
        expect(chicken?.position).toEqual(animal.position);
        expect(player.getInventory().getItemInHand().getAmount()).toBe(0);
    });

    it('gives a transformed interaction item to a creative player without consuming the held item', () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player.getPlayer().gamemode = Gametype.CREATIVE;
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:bucket' }), count: 1 }));
        const animal = live.runtime.spawn('jsprismarine:interact_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (animal === undefined) throw new Error('the fixture declares no interactable entity');

        const body = live.actors.actorOf(animal.id);
        if (body === undefined) throw new Error('the interactable entity has no store actor');
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
            target: { identifier: animal.identifier, runtimeId: Number(body.getRuntimeId()) }
        });

        expect(result).toBe('handled');
        expect(player.getInventory().getItemInHand().getName()).toBe('minecraft:bucket');
        expect(player.getInventory().getItemInHand().getMeta()).toBe(0);
        expect(
            player
                .getInventory()
                .getItems()
                .some((entry) => entry.getItem().getName() === 'minecraft:bucket' && entry.getItem().getMeta() === 1)
        ).toBe(true);
    });

    it('leaves a survival player’s item alone when the interaction does not use it', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:stick' }), count: 2 }));
        const animal = live.runtime.spawn('jsprismarine:interact_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (animal === undefined) throw new Error('the fixture declares no interactable entity');

        const body = live.actors.actorOf(animal.id);
        if (body === undefined) throw new Error('the interactable entity has no store actor');
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
            target: { identifier: animal.identifier, runtimeId: Number(body.getRuntimeId()) }
        });

        expect(result).toBe('handled');
        expect(player.getInventory().getItemInHand().getName()).toBe('minecraft:stick');
        expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(2);

        await live.tick(1);

        expect(animal.instance.hasComponent('minecraft:persistent')).toBe(true);
    });

    it('routes data-defined healing through the live item interaction and consumes one item', async () => {
        const player = addPlayer(2, 2);
        Object.assign(player.getActor()!, { inventory: new HumanInventory() });
        player
            .getInventory()
            .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:cooked_beef' }), count: 1 }));
        const pet = live.runtime.spawn('jsprismarine:pet_fixture', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (pet === undefined) throw new Error('the fixture declares no healable pet');
        live.runtime.hurt(pet, undefined, 'entity_attack', 8);
        await run(1);

        const body = live.actors.actorOf(pet.id);
        if (body === undefined) throw new Error('the healable pet has no store actor');
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
        expect(pet.instance.attributes.get('health')?.current).toBe(16);
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

        const arrow = live.runtime
            .entities()
            .toArray()
            .find((entity) => entity.identifier === 'minecraft:arrow');
        if (arrow === undefined) throw new Error('the item action did not spawn its arrow in the data runtime');
        const arrowBody = live.actors.actorOf(arrow.id);
        if (arrowBody === undefined) throw new Error('the data-driven arrow has no live body');

        expect(arrow.spawnData).toEqual({ critical: true });
        expect(arrow.body.owner).toBe(runtimeId);
        expect(arrow.body.velocity.z).toBeGreaterThan(0);

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
        const arrow = live.runtime
            .entities()
            .toArray()
            .find((entity) => entity.identifier === 'minecraft:arrow');
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

        const arrow = live.runtime
            .entities()
            .toArray()
            .find((entity) => entity.identifier === 'minecraft:arrow');
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

        const chick = live.runtime
            .entities()
            .toArray()
            .find((entity) => entity.identifier === 'minecraft:chicken');
        if (chick === undefined) throw new Error('the egg hit action did not spawn its chicken');
        expect(chick.instance.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('spawns an item from the active spawn_entity component only once', async () => {
        const layer = live.runtime.spawn('jsprismarine:egg_layer', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (layer === undefined) throw new Error('the fixture declares no egg layer');

        await run(5);

        const drops = world
            .getActors()
            .filter((entity) => entity instanceof ItemEntity)
            .map((entity) => entity.getItem()?.getItem().getName());
        expect(drops).toEqual(['minecraft:egg']);
        expect(layer.instance.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('spawns the configured entity count with the named spawn event', async () => {
        const spawner = live.runtime.spawn('jsprismarine:child_spawner', { x: 2.5, y: GROUND_Y, z: 2.5 });
        if (spawner === undefined) throw new Error('the fixture declares no child spawner');

        await run(1);

        const chicks = live.runtime
            .entities()
            .toArray()
            .filter((entity) => entity.identifier === 'minecraft:chicken');
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
            const body = live.actors.actorOf(cow.id);
            if (body === undefined) throw new Error('the data-driven cow has no store actor');

            live.persist();
            if (body.persistentNbt === null) throw new Error('the cow has no saved actor data');
            const record = dataEntityRecordIn(body.persistentNbt);
            if (record === undefined) throw new Error('the saved cow record could not be read back');

            const restored = live.runtime.restore(record, cow.position);

            expect(restored?.spawnData).toEqual(data);
        });

        it('does not persist a data-defined transient entity', () => {
            const transient = live.runtime.spawn('jsprismarine:transient_fixture', {
                x: 0.5,
                y: GROUND_Y,
                z: 0.5
            });
            if (transient === undefined) throw new Error('the fixture declares no transient entity');
            const body = live.actors.actorOf(transient.id);
            if (body === undefined) throw new Error('the transient entity has no store actor');

            live.persist();

            expect(body.shouldPersist()).toBe(false);
            expect(body.persistentNbt).toBeNull();
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

            const zombie = live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'minecraft:zombie');
            if (zombie === undefined) throw new Error('the spawn egg action bypassed the data runtime');
            const villager = live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'minecraft:villager_v2');
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

            const cows = live.runtime
                .entities()
                .toArray()
                .filter((entity) => entity.identifier === 'minecraft:cow');
            expect(cows.length).toBeGreaterThan(0);
            expect(live.runtime.poolCount('animal')).toBe(cows.length);
            // Standing on the floor the chunk actually carries, not at a guessed height.
            for (const cow of cows) {
                expect(cow.position.y).toBe(GROUND_Y);
                expect(cow.position.x - Math.floor(cow.position.x)).toBeCloseTo(0.5);
                expect(cow.position.z - Math.floor(cow.position.z)).toBeCloseTo(0.5);
            }
        });

        it('gives every spawned mob a body the clients are sent', async () => {
            addPlayer(8, 8);

            await live.tick(400);

            const cows = live.runtime
                .entities()
                .toArray()
                .filter((entity) => entity.identifier === 'minecraft:cow').length;
            expect(typesIn(world).filter((type) => type === 'minecraft:cow')).toHaveLength(cows);
            // And the player, whose entity is in the store beside them.
            expect(live.actors.size).toBe(cows + 1);
        });

        it('does not report an unsupported gravity-free mob as grounded', async () => {
            const levitator = live.runtime.spawn('jsprismarine:levitator', {
                x: 2.5,
                y: GROUND_Y + 4,
                z: 2.5
            });
            if (levitator === undefined) throw new Error('the fixture declares no gravity-free mob');

            await run(1);

            expect(live.actors.actorOf(levitator.id)?.isOnGround()).toBe(false);
            expect(live.actors.actorOf(levitator.id)?.metadata.affectedByGravity).toBe(false);
        });

        it('spawns nothing with nobody in the world to spawn around', async () => {
            await live.tick(400);

            expect(live.runtime.entities().toArray()).toEqual([]);
        });

        it('keeps the body moving where the runtime moves the entity', async () => {
            addPlayer(8, 8);
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            // Long enough for the one-tick-in-120 stroll to start, which is vanilla's own
            // cadence for the goal.
            await run(400);

            const body = live.actors.actorOf(cow.id);
            expect(body?.getPosition().getX()).toBeCloseTo(cow.position.x, 5);
            expect(body?.getPosition().getZ()).toBeCloseTo(cow.position.z, 5);
        });
    });

    describe('the world tick', () => {
        it('undoes an actor update that throws, and runs the other actors, the entity pass and replication', () => {
            addPlayer(8.5, 8.5);
            const faulty = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            const healthy = live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 0.5 });
            if (faulty === undefined || healthy === undefined) throw new Error('the fixture declares no minecraft:cow');
            const faultyActor = live.actors.actorOf(faulty.id);
            const healthyActor = live.actors.actorOf(healthy.id);
            if (faultyActor === undefined || healthyActor === undefined) throw new Error('a cow has no store actor');

            // The real update, which writes the status effect clock on an entity's first update,
            // then a throw, so the update has written by the time it throws.
            const update = faultyActor.update.bind(faultyActor);
            const faultyUpdates = vi.spyOn(faultyActor, 'update').mockImplementation((tick) => {
                update(tick);
                throw new Error('the actor update failed');
            });
            const healthyUpdates = vi.spyOn(healthyActor, 'update');
            // The entity pass counts love down, so it shows which cows the pass updated.
            faulty.body.loveTicks = 1000;
            healthy.body.loveTicks = 1000;
            // The actor counts its portal cooldown down, which the log does not carry.
            faultyActor.setPortalCooldown(10);
            healthyActor.setPortalCooldown(10);
            let replicated = 0;
            world.attachChangeSink({
                ...NULL_WORLD_CHANGE_SINK,
                flushEntities: async () => void (replicated += 1)
            });
            const logged: string[] = [];
            const log = (...message: unknown[]): void => void logged.push(String(message[0]));
            Object.assign(world.getServer(), {
                getLogger: () => stub<Logger>({ verbose: log, debug: log, info: log, warn: log, error: log }),
                // No cow stands in a portal, so the travel the tick reports contacts to is never asked.
                getDimensionTravel: () => stub<DimensionTravel>({})
            });

            for (let tick = 1; tick <= ENTITY_FAILURE_LIMIT; tick += 1) {
                world.update(tick);

                expect(faultyUpdates).toHaveBeenCalledTimes(tick);
                expect(healthyUpdates).toHaveBeenCalledTimes(tick);
                expect(healthy.body.loveTicks).toBe(1000 - tick);
                expect(healthyActor.getPortalCooldown()).toBe(10 - tick);
                expect(replicated).toBe(tick);
                // Undone, and skipped by the entity pass for the rest of the tick.
                expect(faulty.body.statusEffectClock).toBeUndefined();
                expect(faultyActor.getPortalCooldown()).toBe(10);
                expect(faulty.body.loveTicks).toBe(1000);
            }

            expect(healthy.body.statusEffectClock).toBeDefined();
            expect(live.runtime.byId(faulty.id)).toBeUndefined();
            expect(live.runtime.byId(healthy.id)).toBe(healthy);
            expect(logged.filter((line) => line.includes('threw in its actor update'))).toHaveLength(
                ENTITY_FAILURE_LIMIT
            );
            expect(world.getEntityStore().broken).toBeUndefined();
        });

        it('files no portal trip for an actor update that throws after it, and keeps the contact', () => {
            addPlayer(8.5, 8.5);
            const faulty = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            const healthy = live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 0.5 });
            if (faulty === undefined || healthy === undefined) throw new Error('the fixture declares no minecraft:cow');
            const faultyActor = live.actors.actorOf(faulty.id);
            const healthyActor = live.actors.actorOf(healthy.id);
            if (faultyActor === undefined || healthyActor === undefined) throw new Error('a cow has no store actor');
            const update = faultyActor.update.bind(faultyActor);
            vi.spyOn(faultyActor, 'update').mockImplementation((tick) => {
                update(tick);
                throw new Error('the actor update failed');
            });
            const departed: bigint[] = [];
            Object.assign(world.getServer(), {
                getDimensionTravel: () =>
                    stub<DimensionTravel>({
                        depart: (entity) => {
                            departed.push(entity.getRuntimeId());
                            return true;
                        }
                    })
            });
            // A mob goes through on its first tick in a portal, so each update below is ready to
            // file its trip.
            const portal = { world, position: new Vector3(0, GROUND_Y, 0), block: 'minecraft:portal' };
            faultyActor.touchPortal(new Vector3(0.5, GROUND_Y, 0.5), portal);
            healthyActor.touchPortal(new Vector3(2.5, GROUND_Y, 0.5), portal);
            const contact = faultyActor.portalContact();

            world.update(1);

            expect(departed).toEqual([healthyActor.getRuntimeId()]);
            expect(healthyActor.portalContact()).toBeUndefined();
            // Put back as the touch left it, still inside and with no time counted.
            expect(faultyActor.portalContact()).toBe(contact);
            expect(contact?.getPortalTime()).toBe(0);
            expect(contact?.tick(0)).toBe(true);
        });

        it('removes an entity whose entity pass keeps throwing, though its actor update finishes', () => {
            addPlayer(8.5, 8.5);
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            vi.spyOn(cow.instance, 'tick').mockImplementation(() => {
                throw new Error('the components failed');
            });
            Object.assign(world.getServer(), { getDimensionTravel: () => stub<DimensionTravel>({}) });

            for (let tick = 1; tick < ENTITY_FAILURE_LIMIT; tick += 1) world.update(tick);
            expect(live.runtime.byId(cow.id)).toBe(cow);

            world.update(ENTITY_FAILURE_LIMIT);
            expect(live.runtime.byId(cow.id)).toBeUndefined();
        });
    });

    describe('combat', () => {
        describe('through the store damage pipeline', () => {
            const cowAt = async (x: number): Promise<{ cow: DataEntity; body: StoreActor }> => {
                const cow = live.runtime.spawn('minecraft:cow', { x, y: GROUND_Y, z: 0.5 });
                if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
                await run(1);
                const body = live.actors.actorOf(cow.id);
                if (body === undefined) throw new Error('the cow has no store actor');
                return { cow, body };
            };
            const routes = (): Record<string, number> => Object.fromEntries(live.runtime.damagePipeline.runsByRoute());

            it("takes a player's swing as melee, and kills in the same call with the events in the legacy order", async () => {
                const player = addPlayer(0.5, 0.5);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                const { cow, body } = await cowAt(1.5);
                const posted: string[] = [];
                const events = world.getServer().getKernel().events;
                for (const name of ['entityDamage', 'entityDeath'] as const) {
                    onTestFinished(events.on(name, () => void posted.push(name)));
                }
                // Each trigger asks whether any criterion listens before it raises, so the order
                // of the questions is the order the blow raised the triggers in.
                const asked: string[] = [];
                vi.spyOn(player.getServer().getContent().advancements, 'listensFor').mockImplementation((trigger) => {
                    asked.push(trigger);
                    return false;
                });

                const landed = meleeAttack(player.getActor()!, body, { damage: 100 });

                expect(landed).toBe(true);
                expect(routes()).toMatchObject({ melee: 1 });
                expect(live.runtime.byId(cow.id)).toBeUndefined();
                expect(posted).toEqual(['entityDamage', 'entityDeath']);
                expect(
                    asked.filter((trigger) => trigger === 'player_killed_entity' || trigger === 'player_hurt_entity')
                ).toEqual(['player_killed_entity', 'player_hurt_entity']);
            });

            it('lets an entityDamage listener cancel or rewrite a blow, as a before-hook', async () => {
                const player = addPlayer(0.5, 0.5);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                const { cow, body } = await cowAt(1.5);
                onTestFinished(
                    world
                        .getServer()
                        .getKernel()
                        .events.on('entityDamage', (event) => event.setAmount(1))
                );

                meleeAttack(player.getActor()!, body, { damage: 5 });

                expect(cow.instance.attributes.get('health')?.current).toBe(9);
            });

            it('takes a legacy blast as an explosion', async () => {
                const { cow, body } = await cowAt(1.5);

                await explode(world, body.getPosition(), { power: 2 });

                expect(routes()).toMatchObject({ explosion: 1 });
                expect(cow.instance.attributes.get('health')?.current ?? 0).toBeLessThan(10);
            });

            it('lets a legacy blast hurt and throw a store mob through its actor', async () => {
                const cow = live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 0.5 });
                if (cow === undefined) throw new Error('the fixture declares no cow');
                const before = cow.instance.attributes.get('health')?.current ?? 0;

                await explode(world, new Vector3(0.5, GROUND_Y, 0.5), { power: 3, breaksBlocks: false });

                expect(cow.instance.attributes.get('health')?.current ?? 0).toBeLessThan(before);
                // Thrown away from the blast, which is to its west.
                expect(cow.body.velocity.x).toBeGreaterThan(0);
            });

            it('takes /damage and /kill as commands', async () => {
                const { cow, body } = await cowAt(1.5);
                const host = entityCommandHost(world.getServer(), new Scoreboard());
                const ref: EntityRef = {
                    id: body.getRuntimeId().toString(),
                    type: 'minecraft:cow',
                    name: 'Cow',
                    isPlayer: false,
                    position: { x: 1.5, y: GROUND_Y, z: 0.5 },
                    rotation: { yaw: 0, pitch: 0 },
                    dimension: Dimensions.Overworld.id
                };

                expect(host.damage(ref, 2, 'minecraft:generic')).toBe(true);
                expect(cow.instance.attributes.get('health')?.current).toBe(8);
                expect(host.kill(ref)).toBe(true);

                expect(routes()).toMatchObject({ command: 2 });
                expect(live.runtime.byId(cow.id)).toBeUndefined();
            });

            it("takes an item behavior's blow as an item", async () => {
                const { cow, body } = await cowAt(1.5);
                const actors = createItemActorPort({
                    world: () => world,
                    entities: stub<ContentEntityAccess>({ drop: () => undefined }),
                    level: unwiredWorld().level
                });

                actors.perform({
                    kind: 'damage-entity',
                    target: { identifier: cow.identifier, runtimeId: Number(body.getRuntimeId()) },
                    amount: 3,
                    damageType: 'minecraft:fall'
                });

                expect(routes()).toMatchObject({ item: 1 });
                expect(cow.instance.attributes.get('health')?.current).toBe(7);
            });

            it('reads its health from the store in the same call as the blow', async () => {
                const { cow, body } = await cowAt(1.5);

                await body.damage(4);

                expect(cow.instance.attributes.get('health')?.current).toBe(6);
                expect(body.getHealth()).toBe(6);
            });

            it('heals in the store, from a legacy heal and from Instant Health', async () => {
                const { cow, body } = await cowAt(1.5);
                live.runtime.hurt(cow, undefined, 'entity_attack', 6);

                expect(await body.heal(2)).toBe(true);
                expect(cow.instance.attributes.get('health')?.current).toBe(6);

                body.addStatusEffect({ id: 'minecraft:instant_health', amplifier: 0, durationTicks: 1 });
                await body.update(1);
                expect(cow.instance.attributes.get('health')?.current).toBe(10);
            });

            it("lets the pack's damage sensor turn a player's swing aside as `entity_attack`", async () => {
                const player = addPlayer(0.5, 0.5);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                const immune = live.runtime.spawn('jsprismarine:sword_immune', { x: 1.5, y: GROUND_Y, z: 0.5 });
                if (immune === undefined) throw new Error('the fixture declares no jsprismarine:sword_immune');
                await run(1);
                const body = live.actors.actorOf(immune.id);
                if (body === undefined) throw new Error('the entity has no store actor');
                const before = immune.instance.attributes.get('health')?.current;

                meleeAttack(player.getActor()!, body, { damage: 5 });

                expect(immune.instance.attributes.get('health')?.current).toBe(before);
            });

            it('takes a status effect as a status effect', async () => {
                const { cow, body } = await cowAt(1.5);
                body.addStatusEffect({
                    id: 'minecraft:poison',
                    amplifier: 4,
                    durationTicks: 100,
                    ambient: false,
                    showParticles: true
                });

                for (let tick = 1; tick <= 25; tick += 1) await body.update(tick);

                expect(routes().status_effect ?? 0).toBeGreaterThan(0);
                expect(cow.instance.attributes.get('health')?.current ?? 10).toBeLessThan(10);
            });
        });

        it('keeps creative players out of zombie combat targets across game-mode changes', async () => {
            const player = addPlayer(1, 0);
            player.getPlayer().gamemode = Gametype.CREATIVE;
            const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');

            await run(20);
            expect(zombie.target).toBeUndefined();

            player.getPlayer().gamemode = Gametype.SURVIVAL;
            await run(20);
            expect(zombie.target).toBe(Number(player.getRuntimeId()));

            player.getPlayer().gamemode = Gametype.CREATIVE;
            await run(20);
            const playerView = live.runtime.mobById(Number(player.getRuntimeId()));
            if (playerView === undefined) throw new Error('the live runtime cannot see its player');
            expect(playerView.identifier?.()).toBe('minecraft:player');
            expect(zombie.target).toBeUndefined();
        });

        it('drops a piglin combat target when its player switches to creative', async () => {
            const player = addPlayer(12, 0);
            player.getPlayer().gamemode = Gametype.SURVIVAL;
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

            player.getPlayer().gamemode = Gametype.CREATIVE;
            expect(await runUntil(() => piglin.brain?.getMemory(MemoryModuleTypes.ATTACK_TARGET) === undefined)).toBe(
                true
            );
        });

        it('keeps a warden from targeting a creative player through its entity sensor', async () => {
            const player = addPlayer(1, 0);
            player.getPlayer().gamemode = Gametype.CREATIVE;
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

            player.getPlayer().gamemode = Gametype.SURVIVAL;
            expect(
                await runUntil(
                    () =>
                        warden.brain?.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)?.id ===
                        String(player.getRuntimeId())
                )
            ).toBe(true);

            player.getPlayer().gamemode = Gametype.CREATIVE;
            expect(
                await runUntil(
                    () => seesPlayer() && warden.brain?.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE) === undefined
                )
            ).toBe(true);
            expect(warden.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBeUndefined();
        });

        it('walks a zombie to a player and hurts them', async () => {
            const player = addPlayer(8, 0);

            const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');

            await run(60);

            expect(zombie.target).toBe(Number(player.getRuntimeId()));
            expect(zombie.position.x).toBeGreaterThan(4);
            // The bite is a blow on the player's store entity, through the store's pipeline.
            expect(player.getPlayer().getHealth()).toBeLessThan(20);
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

        it('keeps two overlapping zombie groups moving toward their shared survival target', async () => {
            const player = addPlayer(12, 0);
            player.getPlayer().gamemode = Gametype.SURVIVAL;
            const groups = [0.5, 4.5].map((x) =>
                Array.from({ length: 12 }, () => {
                    const zombie = live.runtime.spawn('minecraft:zombie', { x, y: GROUND_Y, z: 0.5 });
                    if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');
                    return zombie;
                })
            );
            const zombies = groups.flat();

            await run(200);

            expect(zombies.every((zombie) => zombie.target === Number(player.getRuntimeId()))).toBe(true);
            expect(zombies.every((zombie) => !zombie.body.stuck)).toBe(true);
            expect(
                groups.every((group, index) => group.some((zombie) => zombie.position.x > (index === 0 ? 4 : 8)))
            ).toBe(true);
        });

        it('keeps two same-position zombie groups moving toward one survival target', async () => {
            const player = addPlayer(12, 0);
            player.getPlayer().gamemode = Gametype.SURVIVAL;
            const groups = Array.from({ length: 2 }, () =>
                Array.from({ length: 12 }, () => {
                    const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (zombie === undefined) throw new Error('the fixture declares no minecraft:zombie');
                    return zombie;
                })
            );
            const zombies = groups.flat();

            await run(200);

            expect(zombies.every((zombie) => zombie.target === Number(player.getRuntimeId()))).toBe(true);
            expect(zombies.every((zombie) => !zombie.body.stuck)).toBe(true);
            expect(zombies.filter((zombie) => zombie.position.x > 4)).toHaveLength(24);
        });

        it('shows a store entity to clients through its store actor', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);
            const actor = live.actors.actorOf(cow.id);
            if (actor === undefined) throw new Error('the cow has no actor');

            expect([...world.actors()]).toContain(actor);
            expect(world.getActor(BigInt(cow.id))).toBe(actor);

            live.runtime.hurt(cow, undefined, 'entity_attack', 3);
            await run(1);
            expect(actor.attributes.getValue(AttributeIds.Health)).toBe(7);
            expect(actor.getRuntimeId()).toBe(BigInt(cow.id));
        });

        it('hands no health written onto an actor back to the store, which shows its own', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);
            const actor = live.actors.actorOf(cow.id);
            if (actor === undefined) throw new Error('the cow has no actor');

            // The attribute a client is sent, written by hand: the health comparison read a
            // body's lower health back as damage to the store.
            actor.attributes.setValue(AttributeIds.Health, 2);
            await run(1);

            expect(cow.instance.attributes.get('health')?.current).toBe(10);
            expect(actor.attributes.getValue(AttributeIds.Health)).toBe(10);
        });

        it('drops Java’s loot when a mob is killed, and takes its body away', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

            live.runtime.kill(cow);
            await run(1);

            const dropped = world
                .getActors()
                .filter((entity) => entity instanceof ItemEntity)
                .map((entity) => entity.getItem()?.getItem().getName());
            expect(dropped).toEqual(['minecraft:leather']);
            expect(live.actors.actorOf(cow.id)).toBeUndefined();
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
            expect(live.runtime.entities().toArray()).toContain(dragon);
            // The clients hear the hold begin, so they play the 200-tick death their packs define.
            expect(broadcasts.actorEffects).toContainEqual({
                identifier: 'jsprismarine:dragon_death_fixture',
                entityId: live.actors.actorOf(dragon.id)!.getRuntimeId(),
                effect: ActorEvent.DRAGON_START_DEATH_ANIM
            });

            await run(198);
            expect(live.runtime.entities().toArray()).toContain(dragon);

            await run(1);
            expect(live.runtime.entities().toArray()).not.toContain(dragon);
        });

        it('lands a `/kill` on the ender dragon, whose rules refuse an attacker-less blow', async () => {
            const dragon = live.runtime.spawn('minecraft:ender_dragon', { x: 8.5, y: GROUND_Y + 20, z: 8.5 });
            if (dragon === undefined) throw new Error('the fixture declares no minecraft:ender_dragon');
            await run(1);

            // What the `/kill` verb does to the body: health written to zero with the
            // one cause nothing turns aside. The mirror hands the drop to the runtime
            // with that cause, and the dragon's damage rules let it through whole.
            await live.actors.actorOf(dragon.id)!.setHealth(0, DamageCause.SelfDestruct);
            await run(2);

            expect(dragon.instance.attributes.get('health')?.current).toBe(0);
            expect(dragon.instance.hasComponent('minecraft:behavior.dragondeath')).toBe(true);
        });

        it('shoves the mob away from whoever hit it', async () => {
            // The legacy body had no velocity of its own, so a sword used to take a cow's health
            // away and leave it standing exactly where it was.
            const cow = live.runtime.spawn('minecraft:cow', { x: 4.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);

            const puncher = addPlayer(0, 0.5);
            await live.actors.actorOf(cow.id)!.damage(1, DamageSource.entity(puncher.getActor()!));

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

            await live.actors.actorOf(cow.id)!.damage(4);
            await run(1);

            expect(cow.instance.attributes.get('health')?.current).toBe(6);
        });

        it('sends a data-driven mob hurt sound with the mob identity', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            await run(1);

            const body = live.actors.actorOf(cow.id);
            if (body === undefined) throw new Error('the data-driven cow has no store actor');
            await body.damage(1);

            expect(broadcasts.actorSounds).toEqual([
                { identifier: 'minecraft:cow', entityId: body.getRuntimeId(), sound: LevelSoundEvent.HURT }
            ]);
        });

        it('emits mob-attributed hurt feedback for damage applied through the data runtime', () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const body = live.actors.actorOf(cow.id);
            if (body === undefined) throw new Error('the data-driven cow has no store actor');

            live.runtime.hurt(cow, undefined, 'entity_attack', 1);

            expect(cow.instance.attributes.get('health')?.current).toBe(9);
            expect(broadcasts.actorEffects).toEqual([
                { identifier: 'minecraft:cow', entityId: body.getRuntimeId(), effect: ActorEvent.HURT_ANIMATION }
            ]);
            expect(broadcasts.actorSounds).toEqual([
                { identifier: 'minecraft:cow', entityId: body.getRuntimeId(), sound: LevelSoundEvent.HURT }
            ]);
        });

        it('does not duplicate hurt feedback when a legacy body hit syncs into the data runtime', async () => {
            const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const body = live.actors.actorOf(cow.id);
            if (body === undefined) throw new Error('the data-driven cow has no store actor');

            await body.damage(1);
            await run(1);

            expect(broadcasts.actorEffects).toEqual([
                { identifier: 'minecraft:cow', entityId: body.getRuntimeId(), effect: ActorEvent.HURT_ANIMATION }
            ]);
            expect(broadcasts.actorSounds).toEqual([
                { identifier: 'minecraft:cow', entityId: body.getRuntimeId(), sound: LevelSoundEvent.HURT }
            ]);
        });
    });

    describe('harvesting', () => {
        /** What is lying on the ground, as item identifiers. */
        const lying = (): Array<string | undefined> =>
            world
                .getActors()
                .filter((entity) => entity instanceof ItemEntity)
                .map((entity) => entity.getItem()?.getItem().getName());

        it('rolls Java’s table for the block a mob broke, with the position and the world', async () => {
            expect(world.setLoadedBlockState(8, FLOOR_Y, 8, { name: 'minecraft:dirt', states: {} }, false)).toBe(true);
            live.runtime.breakBlock({ x: 8, y: FLOOR_Y, z: 8 });
            await run(1);

            expect(world.loadedBlockAt(8, FLOOR_Y, 8)?.name).toBe('minecraft:air');
            // The dirt table's only pool is behind a `location_check`, so cobblestone on
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
                .entities()
                .toArray()
                .filter((entity) => entity.instance.activeComponentGroups().includes('baby'));
            expect(babies).toHaveLength(1);
            const babyBody = live.actors.actorOf(babies[0]!.id);
            expect(babyBody?.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.BABY))).toBe(true);
            expect(babyBody?.metadata.getPropertyValue(MetadataFlag.SCALE)).toBe(0.5);
            // The lamb is in the world too, not only in the index.
            expect(typesIn(world).filter((type) => type === 'minecraft:sheep')).toHaveLength(3);
        });
    });

    describe('village raids', () => {
        const record = (overrides: Partial<RaidRecord>): RaidRecord => ({
            id: 1,
            center: { x: 0, y: 64, z: 0 },
            status: 'ongoing',
            omenLevel: 1,
            groupsSpawned: 0,
            numGroups: 5,
            ticksActive: 0,
            waveCountdown: 300,
            celebrationTicks: 0,
            raiders: [],
            ...overrides
        });
        const withRaid = (raid: RaidRecord | undefined) => {
            const host = { raidAt: () => raid };
            Object.assign(world, { getRaidManager: () => host });
        };

        it('tells a villager nothing while no raid runs near it', () => {
            withRaid(undefined);

            expect(live.runtime.host.villagerRaidStateAt?.({ x: 0, y: 64, z: 0 })).toBeUndefined();
        });

        it('says the village waits between waves once a wave has come and its raiders are dead', () => {
            withRaid(record({ groupsSpawned: 1, waveCountdown: 120 }));

            expect(live.runtime.host.villagerRaidStateAt?.({ x: 0, y: 64, z: 0 })).toEqual({
                hasStarted: true,
                betweenWaves: true,
                victory: false
            });
        });

        it('says a wave is on while raiders live, and that the village won once it did', () => {
            withRaid(record({ groupsSpawned: 2, raiders: ['pillager-1'] }));
            expect(live.runtime.host.villagerRaidStateAt?.({ x: 0, y: 64, z: 0 })).toMatchObject({
                hasStarted: true,
                betweenWaves: false,
                victory: false
            });

            withRaid(record({ groupsSpawned: 5, status: 'victory', celebrationTicks: 100 }));
            expect(live.runtime.host.villagerRaidStateAt?.({ x: 0, y: 64, z: 0 })).toMatchObject({ victory: true });
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

        it('logs the offers a trade changes, and an undone trade gives them back', () => {
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');
            const { store } = live.runtime;
            store.beginTick();
            const source = live.runtime.tradeSource(villager);
            if (source === undefined) throw new Error('the villager carries no trade table');
            const drawn = store.sealTick()?.entries ?? [];

            store.beginTick();
            store.unit(() => {
                source.trade(0);
                throw new Error('the trade is undone');
            });
            const undone = store.sealTick()?.entries ?? [];
            const usesAfterUndo = source.offers()[0]?.uses;

            store.beginTick();
            source.trade(0);
            const traded = store.sealTick()?.entries ?? [];

            const merchantEntries = (entries: readonly ChangeEntry[]) =>
                entries.filter(
                    (entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.field === 'merchant'
                );
            // The first ask draws the offers, which is a change from none.
            expect(merchantEntries(drawn)).toEqual([expect.objectContaining({ before: null })]);
            expect(merchantEntries(undone)).toEqual([]);
            expect(usesAfterUndo).toBe(0);
            expect(merchantEntries(traded)).toHaveLength(1);
            expect(source.offers()[0]?.uses).toBe(1);
        });

        it('logs the cured discount the first offers a curing player is shown draw', () => {
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');
            const { store } = live.runtime;
            store.beginTick();
            const source = live.runtime.tradeSource(villager);
            if (source === undefined) throw new Error('the villager carries no trade table');
            store.sealTick();

            store.beginTick();
            source.offers({ curedByPlayer: true });
            const shown = store.sealTick()?.entries ?? [];
            store.beginTick();
            source.offers({ curedByPlayer: true });
            const shownAgain = store.sealTick()?.entries ?? [];

            const merchant = (entries: readonly ChangeEntry[]) =>
                entries.filter(
                    (entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.field === 'merchant'
                );
            expect(merchant(shown)).toHaveLength(1);
            expect(merchant(shownAgain)).toEqual([]);
        });

        it('keeps a villager’s offers, uses and experience across a save and a restore', () => {
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');
            const merchant = live.runtime.merchant(villager);
            if (merchant === undefined) throw new Error('the villager carries no trade table');
            merchant.trade(0);
            merchant.trade(0);
            const body = live.actors.actorOf(villager.id);
            if (body === undefined) throw new Error('the villager has no store actor');

            live.persist();
            if (body.persistentNbt === null) throw new Error('the villager has no saved actor data');
            const record = dataEntityRecordIn(body.persistentNbt);
            if (record === undefined) throw new Error('the saved villager record could not be read back');
            const restored = live.runtime.restore(record, villager.position);
            if (restored === undefined) throw new Error('the villager was not restored');
            const back = live.runtime.merchant(restored);

            const summary = (value: typeof merchant | undefined) =>
                value?.offers().map((entry) => ({
                    gives: entry.offer.gives.map((stack) => `${stack.count} ${stack.item}`),
                    uses: entry.uses,
                    demand: entry.demand
                }));
            expect(record.merchant?.offers[0]?.uses).toBe(2);
            expect(summary(back)).toEqual(summary(merchant));
            expect(back?.experience).toBe(merchant.experience);
        });

        it('draws a villager’s offers fresh when its saved trade state is damaged', () => {
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');
            live.runtime.merchant(villager)?.trade(0);
            const body = live.actors.actorOf(villager.id);
            live.persist();
            const tags = body?.persistentNbt;
            if (tags === null || tags === undefined) throw new Error('nothing was saved');
            const saved: unknown = JSON.parse(tags.getString('jsprismarine:entity', ''));
            if (!isRecord(saved)) throw new Error('the saved entity is not an object');
            saved.merchant = { version: 1, experience: 'lots', offers: [] };
            tags.addValue('jsprismarine:entity', new Types.StringVal(JSON.stringify(saved)));
            const record = dataEntityRecordIn(tags);
            if (record === undefined) throw new Error('the record could not be read back');

            const restored = live.runtime.restore(record, villager.position);

            expect(record.merchant).toBeUndefined();
            expect(restored === undefined ? undefined : live.runtime.merchant(restored)?.offers()[0]?.uses).toBe(0);
        });

        describe('restocking', () => {
            const used = () => {
                const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');
                const merchant = live.runtime.merchant(villager);
                if (merchant === undefined) throw new Error('the villager carries no trade table');
                merchant.trade(0);
                return { villager, merchant };
            };

            it('refills what was used, and not more than twice a day', () => {
                const time = (tick: number) => world.getLevel().setTicks(tick);
                time(100);
                const { villager, merchant } = used();

                live.runtime.villagerRestock(villager.body);
                expect(merchant.offers()[0]?.uses).toBe(0);

                merchant.trade(0);
                live.runtime.villagerRestock(villager.body);
                expect(merchant.offers()[0]?.uses).toBe(1);

                time(100 + 2400);
                live.runtime.villagerRestock(villager.body);
                expect(merchant.offers()[0]?.uses).toBe(0);

                merchant.trade(0);
                time(100 + 4800);
                live.runtime.villagerRestock(villager.body);
                expect(merchant.offers()[0]?.uses).toBe(1);

                time(24000 + 100);
                live.runtime.villagerRestock(villager.body);
                expect(merchant.offers()[0]?.uses).toBe(0);
            });

            it('waits while a player has the trade screen open', () => {
                const { villager, merchant } = used();
                villager.body.tradingPlayer = 7;

                live.runtime.villagerRestock(villager.body);

                expect(merchant.offers()[0]?.uses).toBe(1);
            });
        });

        describe('the trade screen', () => {
            /** A player whose session records the trade windows it is asked to open. */
            const tradingPlayer = (x: number, z: number, sneaking = false) => {
                const player = addPlayer(x, z);
                const opened: OpenTrade[] = [];
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                Object.assign(player.getPlayer(), { isSneaking: () => sneaking });
                Object.assign(player, {
                    openTradeWindow: async (trade: OpenTrade) => {
                        opened.push(trade);
                        return stub<OpenBlockContainer>({});
                    }
                });
                return { player, opened };
            };
            const villagerBody = () => {
                const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');
                const body = live.actors.actorOf(villager.id);
                if (body === undefined) throw new Error('the villager has no store actor');
                return { villager, body };
            };

            it('opens for a player who uses an empty hand on a villager that has offers', async () => {
                const { player, opened } = tradingPlayer(1, 0);
                const { villager, body } = villagerBody();

                await useHeldItemOnEntity(player, body.getRuntimeId());

                expect(opened).toHaveLength(1);
                expect(opened[0]?.trader).toBe(body);
                expect(villager.body.tradingPlayer).toBe(Number(player.getRuntimeId()));
            });

            it('leaves the held item alone when it opens the screen', () => {
                const { player } = tradingPlayer(1, 0);
                const { body } = villagerBody();

                const outcome = live.interactWithItem(body, player.getActor()!, 'minecraft:emerald');

                expect(outcome).toMatchObject({ accepted: true, consumeItem: false });
            });

            it('frees the villager again when the player closes the screen', async () => {
                const { player, opened } = tradingPlayer(1, 0);
                const { villager, body } = villagerBody();
                await useHeldItemOnEntity(player, body.getRuntimeId());

                opened[0]?.release();

                expect(villager.body.tradingPlayer).toBeUndefined();
            });

            it('trades with one player at a time', async () => {
                const first = tradingPlayer(1, 0);
                const { body } = villagerBody();
                await useHeldItemOnEntity(first.player, body.getRuntimeId());
                const second = tradingPlayer(2, 0);

                await useHeldItemOnEntity(second.player, body.getRuntimeId());

                expect(first.opened).toHaveLength(1);
                expect(second.opened).toHaveLength(0);
            });

            it('does not open for a sneaking player, a sleeping villager or a baby', async () => {
                const sneaking = tradingPlayer(1, 0, true);
                const { villager, body } = villagerBody();
                await useHeldItemOnEntity(sneaking.player, body.getRuntimeId());
                expect(sneaking.opened).toHaveLength(0);

                const standing = tradingPlayer(1, 1);
                villager.body.sleeping = true;
                await useHeldItemOnEntity(standing.player, body.getRuntimeId());
                expect(standing.opened).toHaveLength(0);
            });
        });

        it('opens a screen for a player without running goals on a brain-only villager', async () => {
            const player = addPlayer(2, 0);
            const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (villager === undefined) throw new Error('the fixture declares no minecraft:villager_v2');

            const id = Number(player.getRuntimeId());
            live.runtime.openTrade(villager.body, live.runtime.mobById(id)!);
            await run(3);

            expect(villager.body.tradingPlayer).toBe(id);
            // Java's villager trade behavior is brain-driven, so it must not start a parallel Bedrock goal.
            expect(villager.instance.goals.runningGoals()).not.toContain('minecraft:behavior.trade_with_player');
        });
    });

    describe('summoning', () => {
        /** The `/summon` verb, over the same server the runtime is wired into. */
        const summon = (type: string, at: { x: number; y: number; z: number }, yaw = 0) =>
            entityCommandHost(world.getServer(), new Scoreboard()).summon(type, at, { yaw, pitch: 0 }, {});

        it('summons a mob only a pack declares, with its components running', () => {
            const ref = summon('jsprismarine:dustling', { x: 2.5, y: GROUND_Y, z: 2.5 });

            const dustling = live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'jsprismarine:dustling');
            expect(ref?.type).toBe('jsprismarine:dustling');
            expect(dustling).toBeDefined();
            // The spawn event ran, so this is a live component set rather than a bare body.
            expect(dustling?.instance.activeComponentGroups()).toEqual(['settled']);
            expect(dustling?.instance.attributes.get('health')?.max).toBe(6);
            expect(dustling?.instance.goals.names()).toContain('minecraft:behavior.random_stroll');
        });

        it('does not turn a summoned mob toward the sky with the command source pitch', () => {
            entityCommandHost(world.getServer(), new Scoreboard()).summon(
                'jsprismarine:dustling',
                { x: 2.5, y: GROUND_Y, z: 2.5 },
                { yaw: 37, pitch: -90 },
                {}
            );

            const dustling = live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'jsprismarine:dustling');
            expect(dustling?.body.pitch).toBe(0);
        });

        it('gives the summoned mob an actor the clients are sent, facing where it was told', () => {
            const ref = summon('jsprismarine:dustling', { x: 2.5, y: GROUND_Y, z: 2.5 }, 90);

            const body = world.getActors().find((entity) => entity.getType() === 'jsprismarine:dustling');
            expect(body).toBeDefined();
            expect(ref?.id).toBe(body?.getRuntimeId().toString());
            expect(body?.getPosition().getX()).toBe(2.5);
            expect(body?.yaw).toBe(90);
        });

        it('names a summoned mob in the store, where its actor shows the name', () => {
            const host = entityCommandHost(world.getServer(), new Scoreboard());
            const ref = host.summon(
                'jsprismarine:dustling',
                { x: 2.5, y: GROUND_Y, z: 2.5 },
                { yaw: 0, pitch: 0 },
                { name: 'Dusty' }
            );

            const dustling = live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'jsprismarine:dustling');
            expect(ref?.name).toBe('Dusty');
            expect(dustling?.body.nameTag).toBe('Dusty');
        });

        it('kills a summoned mob through its actor, in the store', () => {
            const host = entityCommandHost(world.getServer(), new Scoreboard());
            const ref = summon('jsprismarine:dustling', { x: 2.5, y: GROUND_Y, z: 2.5 });
            if (ref === undefined) throw new Error('the dustling was not summoned');

            expect(world.getActor(BigInt(ref.id))).toBe(live.actors.actorOf(Number(ref.id)));
            expect(host.kill(ref)).toBe(true);
            expect(live.runtime.byId(Number(ref.id))).toBeUndefined();
        });

        it('summons a vanilla mob through the data path rather than a written class', () => {
            summon('minecraft:cow', { x: 4.5, y: GROUND_Y, z: 4.5 });

            expect(
                live.runtime
                    .entities()
                    .toArray()
                    .map((entity) => entity.identifier)
            ).toEqual(['minecraft:cow']);
            expect(live.actors.size).toBe(1);
        });

        it('summons the villager Bedrock summons, not the pre-1.11 one', () => {
            // Mojang's `EntityType` enum still lists `villager` and has no `villager_v2`, so
            // the typed name has to be renamed before the registry is asked. Bedrock spawns
            // the current villager, the one with the brain, the professions and the trades.
            const ref = summon('minecraft:villager', { x: 1.5, y: GROUND_Y, z: 1.5 });

            expect(ref?.type).toBe('minecraft:villager_v2');
            expect(
                live.runtime
                    .entities()
                    .toArray()
                    .map((entity) => entity.identifier)
            ).toEqual(['minecraft:villager_v2']);
        });

        it('leaves a Bedrock-only identifier as typed', () => {
            // `villager_v2` is not a Java entity type, so the rename table does not touch it
            // and the spelling a pack would use still works.
            const ref = summon('minecraft:villager_v2', { x: 1.5, y: GROUND_Y, z: 1.5 });

            expect(ref?.type).toBe('minecraft:villager_v2');
        });

        it('summons nothing for an identifier no pack and no class declares', () => {
            expect(summon('jsprismarine:nothing', { x: 0.5, y: GROUND_Y, z: 0.5 })).toBeUndefined();
            expect(live.runtime.entities().toArray()).toEqual([]);
        });

        it('does not build a written class for an identifier the content has no type for', () => {
            // TNT runs through its data-driven definition when vanilla content is loaded.
            // Without a declared type, `/summon` refuses it instead of creating a class body.
            const ref = summon('minecraft:tnt', { x: 0.5, y: GROUND_Y, z: 0.5 });

            expect(ref).toBeUndefined();
            expect(live.runtime.entities().toArray()).toEqual([]);
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
            const provider = new LevelDB(folder, testEntityServer());
            providers.push(provider);
            const built = liveWorld(provider);

            Object.assign(built.world, {
                name: 'roundtrip',
                // Only read for the name in the save log and for a chunk the database
                // has no record of, which is not the one this writes and reads back.
                generator: { generateChunk: (x: number, z: number) => new Chunk(x, z) }
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

            const restored = second.live.runtime.entities().toArray();
            expect(restored).toHaveLength(1);
            expect(restored[0]?.identifier).toBe('jsprismarine:dustling');
            // A data entity rather than an inert one: it has the component set the
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
            expect(second.live.actors.size).toBe(1);
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

            const villager = second.live.runtime.entities().toArray()[0];
            expect(villager?.brainMob?.id).toBe('minecraft:villager');
            expect(villager?.brain).toBeDefined();
        });

        it('migrates a pre-runtime mob from its saved actor and resumes gravity and goals', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-migrate-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.restoreExisting(
                EntitySerializer.fromNBT(savedActorNbt('minecraft:zombie', { x: 2.5, y: GROUND_Y + 4, z: 3.5 }))
            );

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            const zombie = second.live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'minecraft:zombie');
            if (zombie === undefined) throw new Error('the saved legacy zombie was not migrated into the runtime');
            expect(zombie.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');

            for (let tick = 1; tick <= 30; tick += 1) await second.live.tick(tick);

            expect(zombie.position.y).toBe(GROUND_Y);
            expect(typesIn(second.world).filter((type) => type === 'minecraft:zombie')).toHaveLength(1);
        });

        it('takes a dropped stack out with its chunk, so a reload brings back one', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-item-unload-'));
            folders.push(folder);

            const opened = await session(folder);
            await opened.world.loadChunk(0, 0);
            const item = opened.live.runtime.droppedItems.spawn(
                { x: 2.5, y: GROUND_Y, z: 3.5 },
                { stack: { name: 'minecraft:dirt', count: 1 } }
            );
            if (item === undefined) throw new Error('the fixture declares no dropped item');
            await opened.world.saveChunks();

            const chunk = opened.world.getLoadedChunk(0, 0);
            if (chunk === null) throw new Error('the chunk is not loaded');
            await opened.world['unloadChunks']([chunk]);
            expect(opened.world.getLoadedChunk(0, 0)).toBeNull();
            expect(opened.live.runtime.byId(item.id)).toBeUndefined();

            await opened.world.loadChunk(0, 0);
            const items = opened.live.runtime
                .entities()
                .toArray()
                .filter((entity) => entity.identifier === 'minecraft:item');
            expect(items).toHaveLength(1);
        });

        it('brings a saved mob back with the portal cooldown it was saved with', () => {
            const nbt = savedActorNbt('minecraft:zombie', { x: 2.5, y: GROUND_Y + 4, z: 3.5 });
            nbt.addValue('PortalCooldown', new Types.NumberVal(123));

            const migrated = live.restoreExisting(EntitySerializer.fromNBT(nbt));
            const actor = migrated === undefined ? undefined : live.actors.actorOf(migrated.id);
            if (migrated === undefined || actor === undefined) throw new Error('the saved zombie was not migrated');
            expect(actor.getPortalCooldown()).toBe(123);

            const record = dataEntityRecordOf(migrated, live.runtime.poolOf(migrated.id));
            const restored = live.restore(record, EntitySerializer.fromNBT(EntitySerializer.toNBT(actor)));
            if (restored === undefined) throw new Error('the saved zombie was not restored');
            expect(live.actors.actorOf(restored.id)?.getPortalCooldown()).toBe(123);
        });

        it('migrates a saved actor without a record into the data runtime, facing the way it was saved', async () => {
            const stored = EntitySerializer.fromNBT(
                savedActorNbt('minecraft:zombie', { x: 2.5, y: GROUND_Y + 4, z: 3.5 }, { yaw: 45, pitch: 12 })
            );

            live.restoreExisting(stored);

            const zombie = live.runtime
                .entities()
                .toArray()
                .find((entity) => entity.identifier === 'minecraft:zombie');
            if (zombie === undefined) throw new Error('the legacy zombie was not migrated into the data runtime');
            expect(zombie.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');
            expect(zombie.body.yaw).toBe(45);
            expect(zombie.body.pitch).toBe(12);

            await run(30);

            expect(zombie.position.y).toBe(GROUND_Y);
            expect(typesIn(world).filter((type) => type === 'minecraft:zombie')).toHaveLength(1);
        });

        it('keeps an actor no pack declares across a restart, inert and under its own identifier', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-inert-'));
            folders.push(folder);

            const first = await session(folder);
            const saved = savedActorNbt('minecraft:llama', { x: 2.5, y: GROUND_Y + 4, z: 3.5 });
            saved.addValue('UniqueID', new Types.LongVal(4242n));
            first.live.restoreInert(EntitySerializer.fromNBT(saved));
            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            const [llama] = second.world.getActors().filter((actor) => actor.getType() === 'minecraft:llama');
            if (!(llama instanceof InertActor)) throw new Error('the llama did not come back as an inert actor');
            expect(llama.entity.identifier).toBe(INERT_ACTOR);
            expect(llama.persistentNbt?.getLong('UniqueID', 0n)).toBe(4242n);

            // It stands where it was saved, in the air, and runs nothing.
            for (let tick = 1; tick <= 20; tick += 1) await second.live.tick(tick);
            expect(llama.entity.removed).toBeUndefined();
            expect(llama.entity.position).toEqual({ x: 2.5, y: GROUND_Y + 4, z: 3.5 });
        });

        it('restores migrated legacy mobs when their chunks load', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-level-migrate-'));
            folders.push(folder);

            const provider = new LevelDB(folder, testEntityServer());
            providers.push(provider);
            const setup = liveWorld(provider);
            setup.hold(buildOver(setup.world, setup.runtimes));

            Object.assign(setup.world, {
                name: 'roundtrip',
                generator: { generateChunk: (x: number, z: number) => new Chunk(x, z) },
                chunks: new Map<number, Chunk>()
            });
            provider.setWorld(setup.world);
            await provider.enable();
            await provider.migrateLegacyWorldData({
                entities: [
                    {
                        type: 'minecraft:zombie',
                        position: { x: 2.5, y: GROUND_Y + 4, z: 3.5, yaw: 90, pitch: 12 }
                    }
                ]
            });

            expect([...provider.listChunks(Dimensions.Overworld)]).toContainEqual({ x: 0, z: 0 });
            await setup.world.loadChunk(0, 0);

            const zombie = setup.runtimes.at(DIMENSION)?.runtime.entities().toArray()[0];
            expect(zombie?.identifier).toBe('minecraft:zombie');
            expect(zombie?.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');
            expect(zombie?.body.yaw).toBe(90);
            expect(zombie?.body.pitch).toBe(12);
            expect(typesIn(setup.world).filter((type) => type === 'minecraft:zombie')).toHaveLength(1);
        });

        it('replaces a live body with the stored actor when its chunk loads', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-duplicate-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 3.5 });

            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            // A body can already be in the world when its stored chunk arrives. The full actor
            // record must replace it instead of leaving two runtime entities at the same spot.
            second.live.runtime.spawn('minecraft:cow', { x: 2.5, y: GROUND_Y, z: 3.5 });
            await second.world.loadChunk(0, 0);

            expect(typesIn(second.world).filter((type) => type === 'minecraft:cow')).toHaveLength(1);
            expect(second.live.runtime.entities().toArray()).toHaveLength(1);
            expect(second.live.actors.size).toBe(1);
        });

        it('brings a dropped stack back into the store from its actor record', async () => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-entity-item-'));
            folders.push(folder);

            const first = await session(folder);
            first.live.dropItem({ x: 2.5, y: GROUND_Y, z: 3.5 }, { stack: { name: 'minecraft:stone', count: 4 } });
            await first.world.saveChunks();
            await first.provider.disable();

            const second = await session(folder);
            await second.world.loadChunk(0, 0);

            const [stack] = second.live.runtime.entities().toArray();
            expect(stack?.identifier).toBe('minecraft:item');
            expect(stack === undefined ? undefined : itemViewOf(stack)?.stack).toEqual({
                name: 'minecraft:stone',
                count: 4
            });
            expect(typesIn(second.world)).toEqual(['minecraft:item']);
        });
    });

    describe('the end crystal', () => {
        it('announces its beam target and base plate in the actor metadata a client is sent', () => {
            const crystal = live.runtime.spawn(
                'minecraft:ender_crystal',
                { x: 0.5, y: GROUND_Y, z: 0.5 },
                { beamTarget: { x: 0, y: 128, z: 0 }, showBottom: false }
            );
            if (crystal === undefined) throw new Error('the fixture declares no minecraft:ender_crystal');
            const body = live.actors.actorOf(crystal.id);
            if (body === undefined) throw new Error('the crystal has no store actor');

            expect(body.metadata.getPropertyValue(ActorDataID.BLOCK_TARGET)).toEqual(new Vector3(0, 128, 0));
            expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SHOW_BOTTOM))).toBe(false);

            const bare = live.runtime.spawn('minecraft:ender_crystal', { x: 4.5, y: GROUND_Y, z: 0.5 });
            if (bare === undefined) throw new Error('the fixture declares no second crystal');
            const bareBody = live.actors.actorOf(bare.id);
            if (bareBody === undefined) throw new Error('the second crystal has no store actor');

            expect(bareBody.metadata.getPropertyValue(ActorDataID.BLOCK_TARGET)).toBeNull();
            expect(bareBody.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SHOW_BOTTOM))).toBe(true);
        });

        it('explodes when a hit kills it, and an invulnerable one survives the blast', async () => {
            const crystal = live.runtime.spawn('minecraft:ender_crystal', { x: 0.5, y: GROUND_Y, z: 0.5 });
            const guarded = live.runtime.spawn(
                'minecraft:ender_crystal',
                { x: 3.5, y: GROUND_Y, z: 0.5 },
                { invulnerable: true }
            );
            if (crystal === undefined || guarded === undefined)
                throw new Error('the fixture declares no minecraft:ender_crystal');

            live.runtime.hurt(crystal, undefined, 'entity_attack', 1);
            await run(2);

            expect(crystal.removed).toBe('explosion');
            expect(guarded.removed).toBeUndefined();
            expect(guarded.instance.attributes.get('health')?.current).toBe(1);
            expect(typesIn(world).filter((type) => type === 'minecraft:ender_crystal')).toHaveLength(1);

            live.runtime.hurt(guarded, undefined, 'entity_attack', 1);
            await run(2);

            expect(guarded.removed).toBeUndefined();
            expect(guarded.instance.attributes.get('health')?.current).toBe(1);
        });

        it('explodes from a body hit without mob hurt feedback', async () => {
            const crystal = live.runtime.spawn('minecraft:ender_crystal', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (crystal === undefined) throw new Error('the fixture declares no minecraft:ender_crystal');
            await run(1);

            const body = live.actors.actorOf(crystal.id);
            if (body === undefined) throw new Error('the crystal has no store actor');
            await body.damage(1);

            expect(broadcasts.actorEffects).not.toContainEqual({
                identifier: 'minecraft:ender_crystal',
                entityId: body.getRuntimeId(),
                effect: ActorEvent.HURT_ANIMATION
            });
            expect(broadcasts.actorSounds).not.toContainEqual({
                identifier: 'minecraft:ender_crystal',
                entityId: body.getRuntimeId(),
                sound: LevelSoundEvent.HURT
            });

            await run(2);

            expect(crystal.removed).toBe('explosion');
        });

        it('does not give a healthless object the generic living health attribute', async () => {
            const cushion = live.runtime.spawn('minecraft:cushion', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (cushion === undefined) throw new Error('the fixture declares no minecraft:cushion');
            const body = live.actors.actorOf(cushion.id);
            if (body === undefined) throw new Error('the cushion has no store actor');

            expect(body.attributes.getAttribute(AttributeIds.Health)).toBeNull();
            expect(live.runtime.hurt(cushion, undefined, 'entity_attack', 1)).toBe(false);
            expect(await body.damage(1)).toBe(false);
            expect(broadcasts.actorEffects).toEqual([]);
            expect(broadcasts.actorSounds).toEqual([]);
        });

        it('projects a beam target moved at runtime into the actor metadata', async () => {
            const crystal = live.runtime.spawn('minecraft:ender_crystal', { x: 0.5, y: GROUND_Y, z: 0.5 });
            if (crystal === undefined) throw new Error('the fixture declares no minecraft:ender_crystal');
            await run(1);

            crystal.body.beamTarget = { x: 0, y: 128, z: 0 };
            await live.tick(2);

            const body = live.actors.actorOf(crystal.id);
            expect(body?.metadata.getPropertyValue(ActorDataID.BLOCK_TARGET)).toEqual(new Vector3(0, 128, 0));
        });
    });

    describe.skipIf(!process.env.JSP_CONTENT_VANILLA)(
        'over the vanilla entity definitions',
        { tags: ['real-data'] },
        () => {
            const useVanillaContent = (): void => {
                const setup = liveWorld();
                world = setup.world;
                broadcasts = setup.broadcasts;
                runtimes = setup.runtimes;
                world.getGameRuleManager().setGameRule(GameRules.DoMobSpawning, false, true);

                let built: ServerContent | undefined;
                worldSource = serverWorldSource({
                    worldFor: () => world,
                    content: () => built!,
                    seed: 1234n,
                    difficulty: () => Difficulty.NORMAL,
                    entityRuntimes: runtimes
                });
                built = buildServerContent({
                    seed: 1234n,
                    world: worldSource
                });
                setup.hold(built);

                const opened = runtimes.at(DIMENSION);
                if (opened === undefined) throw new Error('the vanilla content opened no entity runtime');
                live = opened;
            };

            it(
                'keeps clustered zombie groups moving toward a shared survival target',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();
                    const player = addPlayer(14, 1);
                    player.getPlayer().gamemode = Gametype.SURVIVAL;
                    const positions = [0.5, 5.5].flatMap((originX) =>
                        Array.from({ length: 15 }, (_, index) => ({
                            x: originX + (index % 5) * 0.32,
                            y: GROUND_Y,
                            z: 0.5 + Math.floor(index / 5) * 0.32
                        }))
                    );
                    const entries = positions.map((position) => {
                        const zombie = live.runtime.spawn('minecraft:zombie', position);
                        if (zombie === undefined) throw new Error('vanilla content declares no zombie');
                        return { zombie, position };
                    });
                    const zombies = entries.map(({ zombie }) => zombie);
                    let jumpingTicks = 0;
                    let airborneTicks = 0;
                    const samples = [];
                    for (let tick = 1; tick <= 200; tick += 1) {
                        await live.tick(tick);
                        const jumping = zombies.filter(({ body }) => body.conditions.has('jumping')).length;
                        const airborne = zombies.filter(({ position }) => position.y > GROUND_Y + 0.05).length;
                        jumpingTicks += jumping;
                        airborneTicks += airborne;
                        if (tick % 20 === 0) {
                            samples.push({
                                tick,
                                moved: entries.filter(
                                    ({ zombie, position }) =>
                                        Math.hypot(zombie.position.x - position.x, zombie.position.z - position.z) > 0.3
                                ).length,
                                targets: zombies.filter((zombie) => zombie.target === Number(player.getRuntimeId()))
                                    .length,
                                jumping,
                                airborne,
                                stuck: zombies.filter(({ body }) => body.stuck).length
                            });
                        }
                    }
                    const firstSample = samples[0];
                    const lastSample = samples.at(-1);
                    if (firstSample === undefined || lastSample === undefined)
                        throw new Error('no crowd samples were taken');

                    expect(
                        samples.every(
                            ({ targets, jumping, airborne, stuck }) =>
                                targets === zombies.length && jumping === 0 && airborne === 0 && stuck === 0
                        )
                    ).toBe(true);
                    expect(firstSample.moved).toBeGreaterThanOrEqual(24);
                    expect(lastSample.moved).toBe(zombies.length);
                    expect(jumpingTicks).toBe(0);
                    expect(airborneTicks).toBe(0);
                    expect(zombies).toHaveLength(30);
                }
            );

            it('spawns a bow arrow through the live data-driven projectile runtime', async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                const shot = loose(player.getActor()!, 20);

                expect(shot).toBe(true);
                const arrow = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:arrow');
                if (arrow === undefined) throw new Error('the bow arrow bypassed the data-driven entity runtime');

                expect(arrow.body.owner).toBe(Number(player.getRuntimeId()));
                expect(arrow.spawnData?.['critical']).toBe(true);
                const body = live.actors.actorOf(arrow.id);
                if (body === undefined) throw new Error('the runtime arrow has no client-facing actor');
                expect(typesIn(world)).toContain('minecraft:arrow');
                expect(broadcasts.actorSounds).toContainEqual({
                    identifier: 'minecraft:player',
                    entityId: player.getRuntimeId(),
                    sound: LevelSoundEvent.BOW
                });

                await live.tick(1);

                expect(arrow.position.z).toBeGreaterThan(2);
                expect(body.getPosition().getZ()).toBeCloseTo(arrow.position.z, 5);
            });

            it(
                'counts down and detonates primed TNT from its active explode component',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();

                    world.getGameRuleManager().setGameRule(GameRules.MobGriefing, false, true);
                    await world.setBlockByName(1, GROUND_Y, 0, 'minecraft:tnt');
                    const tnt = live.runtime.spawn('minecraft:tnt', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (tnt === undefined) throw new Error('vanilla content declares no TNT');
                    const body = live.actors.actorOf(tnt.id);
                    if (body === undefined) throw new Error('the primed TNT has no store actor');

                    expect(body.metadata.getPropertyValue(MetadataFlag.FUSE_TIME)).toBe(80);

                    for (let tick = 1; tick <= 40; tick += 1) await live.tick(tick);

                    expect(body.metadata.getPropertyValue(MetadataFlag.FUSE_TIME)).toBe(40);
                    live.persist();
                    const record = body.persistentNbt === null ? undefined : dataEntityRecordIn(body.persistentNbt);
                    if (record === undefined) throw new Error('the primed TNT did not persist its fuse');

                    live.runtime.remove(tnt.id, 'test_restore');
                    const restored = live.runtime.restore(record, tnt.position);
                    if (restored === undefined) throw new Error('the saved TNT could not be restored');
                    const restoredBody = live.actors.actorOf(restored.id);
                    if (restoredBody === undefined) throw new Error('the restored TNT has no store actor');

                    expect(restored.body.fuseTicks).toBe(40);

                    for (let tick = 41; tick < 80; tick += 1) await live.tick(tick);

                    expect(live.runtime.byId(restored.id)).toBeDefined();
                    expect(restoredBody.metadata.getPropertyValue(MetadataFlag.FUSE_TIME)).toBe(1);

                    await live.tick(80);

                    expect(live.runtime.byId(restored.id)).toBeUndefined();
                    expect(live.actors.actorOf(restored.id)).toBeUndefined();
                    expect((await world.getBlockState(0, FLOOR_Y, 0)).name).toBe('minecraft:air');
                    expect((await world.getBlockState(1, GROUND_Y, 0)).name).toBe('minecraft:air');
                    const chained = live.runtime
                        .entities()
                        .toArray()
                        .find((entity) => entity.identifier === 'minecraft:tnt');
                    expect(chained?.body.fuseTicks).toBeGreaterThanOrEqual(10);
                    expect(chained?.body.fuseTicks).toBeLessThanOrEqual(29);
                    expect(chained?.body.owner).toBe(restored.id);
                }
            );

            it('migrates an existing legacy TNT body with its remaining metadata fuse', { timeout: 180_000 }, () => {
                useVanillaContent();

                const actor = savedActorNbt('minecraft:tnt', { x: 0.5, y: GROUND_Y, z: 0.5 });
                actor.addValue('Fuse', new Types.NumberVal(37));
                const migrated = live.restoreExisting(EntitySerializer.fromNBT(actor));
                if (migrated === undefined)
                    throw new Error('the vanilla TNT definition could not restore the existing body');

                expect(migrated.identifier).toBe('minecraft:tnt');
                expect(migrated.body.fuseTicks).toBe(37);
                expect(live.actors.actorOf(migrated.id)).toBeDefined();
            });

            it('removes a primed TNT without a blast when tntExplodes is disabled', { timeout: 180_000 }, async () => {
                useVanillaContent();
                world.getGameRuleManager().setGameRule(GameRules.TNTExplodes, false, true);

                const tnt = live.runtime.spawn('minecraft:tnt', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (tnt === undefined) throw new Error('vanilla content declares no TNT');
                for (let tick = 1; tick <= 80; tick += 1) await live.tick(tick);

                expect(live.runtime.byId(tnt.id)).toBeUndefined();
                expect((await world.getBlockState(0, FLOOR_Y, 0)).name).toBe('minecraft:stone');
            });

            it(
                'starts a creeper fuse when its data adds the exploding component group',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();

                    const creeper = live.runtime.spawn('minecraft:creeper', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (creeper === undefined) throw new Error('vanilla content declares no creeper');
                    expect(creeper.body.fuseTicks).toBeUndefined();

                    live.runtime.trigger(creeper.body, 'minecraft:start_exploding', 'self');
                    await live.tick(1);

                    expect(creeper.body.fuseTicks).toBe(29);
                    for (let tick = 2; tick <= 30; tick += 1) await live.tick(tick);
                    expect(live.runtime.byId(creeper.id)).toBeUndefined();
                }
            );

            it('keeps a grounded mob level when it looks at a player', async () => {
                useVanillaContent();

                const player = addPlayer(1.5, 0.5);
                const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (zombie === undefined) throw new Error('vanilla content declares no zombie');

                await run(5);

                expect(zombie.target).toBe(Number(player.getRuntimeId()));
                expect(zombie.body.pitch).toBeGreaterThan(-10);
                expect(zombie.body.pitch).toBeLessThan(10);
            });

            it('shows hearts when a vanilla animal accepts a breeding item', { timeout: 180_000 }, () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:wheat' }), count: 2 }));
                const sheep = live.runtime.spawn('minecraft:sheep', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (sheep === undefined) throw new Error('vanilla content declares no sheep');
                const body = live.actors.actorOf(sheep.id);
                if (body === undefined) throw new Error('the vanilla sheep has no client-facing actor');
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
                    target: { identifier: sheep.identifier, runtimeId: Number(body.getRuntimeId()) }
                });

                expect(result).toBe('handled');
                expect(sheep.body.loveTicks).toBeGreaterThan(0);
                expect(broadcasts.actorEffects).toContainEqual({
                    identifier: 'minecraft:sheep',
                    entityId: body.getRuntimeId(),
                    effect: ActorEvent.LOVE_HEARTS
                });
            });

            it('repairs an injured iron golem through its vanilla interaction data', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:iron_ingot' }), count: 2 }));
                const golem = live.runtime.spawn('minecraft:iron_golem', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (golem === undefined) throw new Error('vanilla content declares no iron golem');
                const health = golem.instance.attributes.get('health');
                const body = live.actors.actorOf(golem.id);
                if (health === undefined || body === undefined) throw new Error('the vanilla iron golem is incomplete');

                live.runtime.hurt(golem, undefined, 'entity_attack', 25);
                const injuredHealth = golem.instance.attributes.get('health')?.current;
                if (injuredHealth === undefined) throw new Error('the iron golem has no health after being injured');

                await useHeldItemOnEntity(player, body.getRuntimeId());

                expect(golem.instance.attributes.get('health')?.current).toBe(Math.min(health.max, injuredHealth + 25));
                expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(1);

                await useHeldItemOnEntity(player, body.getRuntimeId());

                expect(golem.instance.attributes.get('health')?.current).toBe(health.max);
                expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(1);
            });

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

                    const entity = spawnDeclared(live.runtime, identifier, position);
                    if (entity === undefined) {
                        failures.push(`${identifier}: runtime did not create an entity`);
                        continue;
                    }
                    const body = live.actors.actorOf(entity.id);
                    if (body === undefined) failures.push(`${identifier}: no live actor body`);
                }

                expect(failures).toEqual([]);
            });

            it('spawns and lands falling blocks through the live runtime', async () => {
                useVanillaContent();

                const id = live.runtime
                    .content()
                    .world.blockWorld.at(DIMENSION)
                    .spawnEntity({ x: 2, y: GROUND_Y + 4, z: 2 }, 'minecraft:falling_block', {
                        block: 'minecraft:stone'
                    });
                const fallingBlock = live.runtime.byId(id);
                const body = live.actors.actorOf(id);

                expect(fallingBlock?.identifier).toBe('minecraft:falling_block');
                expect(fallingBlock?.spawnData).toEqual({ block: 'minecraft:stone' });
                expect(fallingBlock?.facts.box).toEqual({ width: 0.98, height: 0.98 });
                expect(body?.metadata.affectedByGravity).toBe(true);
                expect(body?.metadata.collidable).toBe(false);
                expect(body?.metadata.getPropertyValue(MetadataFlag.VARIANT)).toBe(idOf('minecraft:stone'));

                for (let tick = 1; tick <= 40; tick += 1) await live.tick(tick);

                expect((await world.getBlockState(2, GROUND_Y, 2)).name).toBe('minecraft:stone');
                expect(live.runtime.byId(id)).toBeUndefined();
                expect(live.actors.actorOf(id)).toBeUndefined();
            });

            it('routes a block falling from its support through the live runtime', async () => {
                useVanillaContent();

                const chunk = world.getLoadedChunk(0, 0);
                if (chunk === null) throw new Error('the falling-block test chunk was not loaded');
                chunk.setBlockRuntimeId(2, FLOOR_Y, 2, idOf('minecraft:air'));
                chunk.setBlockRuntimeId(2, FLOOR_Y + 1, 2, idOf('minecraft:sand'));

                await new BlockPhysics(world).update(2, FLOOR_Y + 1, 2, 0);

                const fallingBlock = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:falling_block');
                if (fallingBlock === undefined) throw new Error('the sand bypassed the data-driven entity runtime');
                expect(fallingBlock.spawnData).toEqual({ block: 'minecraft:sand' });

                for (let tick = 1; tick <= 40; tick += 1) await live.tick(tick);

                expect((await world.getBlockState(2, FLOOR_Y, 2)).name).toBe('minecraft:sand');
                expect(live.runtime.byId(fallingBlock.id)).toBeUndefined();
            });

            it('migrates a serialized legacy TNT with its saved fuse into the runtime', () => {
                useVanillaContent();

                const actor = savedActorNbt('minecraft:tnt', { x: 0.5, y: GROUND_Y, z: 0.5 });
                actor.addValue('JSPFuse', new Types.NumberVal(58));
                const migrated = live.restoreExisting(EntitySerializer.fromNBT(actor));

                expect(migrated?.identifier).toBe('minecraft:tnt');
                expect(migrated?.body.fuseTicks).toBe(58);
                expect(migrated?.instance.hasComponent('minecraft:explode')).toBe(true);
                expect(live.actors.actorOf(migrated?.id ?? 0)).toBeDefined();
            });

            it('migrates a serialized legacy falling block into the runtime and lands it', async () => {
                useVanillaContent();

                const actor = savedActorNbt('minecraft:falling_block', { x: 2.5, y: GROUND_Y + 4, z: 2.5 });
                actor.addValue('JSPBlockName', new Types.StringVal('minecraft:stone'));
                const stored = EntitySerializer.fromNBT(actor);
                const migrated = live.restoreExisting(stored);
                if (migrated === undefined) throw new Error('the saved falling block was not migrated');

                expect(migrated.identifier).toBe('minecraft:falling_block');
                expect(migrated.spawnData).toEqual({ block: 'minecraft:stone' });
                expect(migrated.instance.hasComponent('jsprismarine:falling_block')).toBe(true);

                for (let tick = 1; tick <= 40; tick += 1) await live.tick(tick);

                expect((await world.getBlockState(2, GROUND_Y, 2)).name).toBe('minecraft:stone');
                expect(live.runtime.byId(migrated.id)).toBeUndefined();
            });

            it(
                'runs spawn egg actions for water, ground, and brain mobs with vanilla components',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();

                    // Water replaces the two water spawns' floor blocks. Keep the pursuer and pig on dry
                    // land; the float goal is covered by the separate liquid-physics test below.
                    for (const x of [20, 22]) {
                        const chunk = world.getLoadedChunk(x >> 4, 0);
                        if (chunk === null) throw new Error(`the vanilla entity test chunk for x=${x} was not loaded`);
                        chunk.setBlockRuntimeId(x & 15, FLOOR_Y, 2, idOf('minecraft:water'));
                    }

                    const player = addPlayer(8, 2);
                    for (const [identifier, x] of [
                        ['minecraft:zombie', 2],
                        ['minecraft:villager_v2', 40],
                        ['minecraft:pig', 24],
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

                    const villager = live.runtime
                        .entities()
                        .toArray()
                        .find((entity) => entity.identifier === 'minecraft:villager_v2');
                    if (villager === undefined)
                        throw new Error('the vanilla villager spawn egg action bypassed the data runtime');
                    const zombies = live.runtime
                        .entities()
                        .toArray()
                        .filter((entity) => entity.identifier === 'minecraft:zombie');
                    const zombie = zombies.find((entity) => entity.position.x < 5);
                    if (zombie === undefined)
                        throw new Error('the vanilla zombie spawn egg action bypassed the data runtime');
                    const waterZombie = zombies.find((entity) => entity.position.x > 22);
                    if (waterZombie === undefined)
                        throw new Error('the vanilla water zombie spawn egg action bypassed the data runtime');
                    const pig = live.runtime
                        .entities()
                        .toArray()
                        .find((entity) => entity.identifier === 'minecraft:pig');
                    if (pig === undefined)
                        throw new Error('the vanilla pig spawn egg action bypassed the data runtime');
                    expect(villager.brain).toBeDefined();
                    expect(waterZombie.facts.underwaterMovement).toBeLessThan(waterZombie.facts.movement);

                    await live.tick(1);
                    expect(zombie.position.y).toBe(GROUND_Y);
                    expect(waterZombie.position.y).toBeLessThan(GROUND_Y);
                    expect(Math.abs(pig.position.y - GROUND_Y)).toBeLessThan(0.1);
                    for (let tick = 2; tick <= 30; tick += 1) await live.tick(tick);

                    expect(zombie.instance.goals.names()).toContain('minecraft:behavior.nearest_attackable_target');
                    expect(zombie.target).toBe(Number(player.getRuntimeId()));
                    // Walking toward the player at Java's stride, about 0.117 blocks a tick for the
                    // zombie's 0.23. These direct runtime ticks leave the level clock at 0, so its
                    // daylight burn lands every tick and it dies at tick 20, two blocks on.
                    expect(zombie.position.x).toBeGreaterThan(4);
                    expect(zombie.position.y).toBe(GROUND_Y);
                    expect(waterZombie.position.y).toBeLessThan(GROUND_Y);
                    expect(Math.abs(pig.position.y - GROUND_Y)).toBeLessThan(0.1);
                    expect(villager.position.y).toBe(GROUND_Y);
                    expect(typesIn(world)).toContain('minecraft:zombie');
                    expect(typesIn(world)).toContain('minecraft:villager_v2');
                }
            );

            it('marks a vanilla lamb as a baby on its client-facing actor', { timeout: 180_000 }, () => {
                useVanillaContent();

                const first = live.runtime.spawn('minecraft:sheep', { x: 0.5, y: GROUND_Y, z: 0.5 });
                const second = live.runtime.spawn('minecraft:sheep', { x: 2.5, y: GROUND_Y, z: 0.5 });
                if (first === undefined || second === undefined) throw new Error('vanilla content declares no sheep');
                const mate = live.runtime.mobById(second.id);
                if (mate === undefined) throw new Error('the second vanilla sheep has no goal view');
                live.runtime.setInLove(first.id, 400);
                live.runtime.setInLove(second.id, 400);
                live.runtime.breedWith(first.body, mate);

                const lamb = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.id !== first.id && entity.id !== second.id);
                if (lamb === undefined) throw new Error('vanilla sheep breeding made no lamb');
                const body = live.actors.actorOf(lamb.id);
                if (body === undefined) throw new Error('the vanilla lamb has no client-facing actor');

                expect(lamb.instance.hasComponent('minecraft:is_baby')).toBe(true);
                expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.BABY))).toBe(true);
            });

            it('shears a vanilla sheep through its data-defined interaction', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(new ContainerEntry({ item: new Item({ name: 'minecraft:shears' }), count: 1 }));
                const sheep = live.runtime.spawn('minecraft:sheep', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (sheep === undefined) throw new Error('vanilla content declares no sheep');
                const body = live.actors.actorOf(sheep.id);
                if (body === undefined) throw new Error('the vanilla sheep has no client-facing actor');
                const color = sheep.instance.componentParams('minecraft:color');
                const colorIndex = typeof color === 'number' ? color : 0;
                const expectedWoolIdentifier = legacy_item_aux_aliases['minecraft:wool']?.[String(colorIndex)];
                if (expectedWoolIdentifier === undefined)
                    throw new Error(`Bedrock has no wool item for color ${colorIndex}`);
                const wool = live.runtime.content().equipmentLoot.roll('loot_tables/entities/sheep_shear.json', {
                    parameterSet: 'shearing',
                    parameters: {
                        this_entity: {
                            type: sheep.identifier,
                            components: new Map([['minecraft:color', colorIndex]])
                        },
                        origin: { x: 2, y: GROUND_Y, z: 2 },
                        tool: { id: 'minecraft:shears', count: 1, components: new Map() }
                    }
                });
                expect(wool).toHaveLength(1);
                expect(wool[0]).toMatchObject({ id: 'minecraft:wool', meta: colorIndex });
                expect(wool[0]?.count).toBeGreaterThanOrEqual(1);
                expect(wool[0]?.count).toBeLessThanOrEqual(3);
                const actors = createItemActorPort({
                    world: () => world,
                    entities: stub<ContentEntityAccess>({ drop: () => undefined }),
                    level: unwiredWorld().level,
                    interactWithEntity: (target, owner, item) => live.interactWithItem(target, owner, item)
                });

                expect(
                    useItemOnEntity({
                        content: live.runtime.content(),
                        actors,
                        player,
                        target: { identifier: sheep.identifier, runtimeId: Number(body.getRuntimeId()) }
                    })
                ).toBe('handled');
                await live.tick(1);

                expect(sheep.instance.hasComponent('minecraft:is_sheared')).toBe(true);
                const droppedWool = world
                    .getActors()
                    .filter((entity) => entity instanceof ItemEntity)
                    .find((entity) => entity.getItem()?.getItem().getName() === expectedWoolIdentifier);
                const droppedItem = droppedWool?.getItem()?.getItem();
                expect(droppedItem?.getName()).toBe(expectedWoolIdentifier);
                expect(droppedItem?.getMeta()).toBe(0);
                expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SHEARED))).toBe(true);
            });

            it('spawns a spawn egg mob inside the entity it is used on', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(
                        new ContainerEntry({ item: new Item({ name: 'minecraft:creeper_spawn_egg' }), count: 2 })
                    );
                const pig = live.runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (pig === undefined) throw new Error('vanilla content declares no pig');
                const body = live.actors.actorOf(pig.id);
                if (body === undefined) throw new Error('the vanilla pig has no client-facing actor');
                await useHeldItemOnEntity(player, body.getRuntimeId());

                const creeper = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:creeper');
                if (creeper === undefined) throw new Error('the spawn egg created no creeper');
                expect(creeper.position).toEqual(pig.position);
                expect(creeper.instance.hasComponent('minecraft:is_baby')).toBe(false);
                const creeperBody = live.actors.actorOf(creeper.id);
                if (creeperBody === undefined) throw new Error('the spawned creeper has no client-facing actor');
                const bodyPosition = creeperBody.getPosition();
                expect([bodyPosition.getX(), bodyPosition.getY(), bodyPosition.getZ()]).toEqual([
                    pig.position.x,
                    pig.position.y,
                    pig.position.z
                ]);
                expect(player.getInventory().getEntry(player.getInventory().getHandSlotIndex())?.getCount()).toBe(1);
                expect(player.getInventory().getItemInHand().getAmount()).toBe(1);
            });

            it('maps a spawn egg entity id before spawning inside another mob', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(
                        new ContainerEntry({ item: new Item({ name: 'minecraft:villager_spawn_egg' }), count: 1 })
                    );
                const pig = live.runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (pig === undefined) throw new Error('vanilla content declares no pig');
                const pigBody = live.actors.actorOf(pig.id);
                if (pigBody === undefined) throw new Error('the vanilla pig has no client-facing actor');

                await useHeldItemOnEntity(player, pigBody.getRuntimeId());

                const villager = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:villager_v2');
                expect(villager?.position).toEqual(pig.position);
                expect(villager && live.actors.actorOf(villager.id)).toBeDefined();
            });

            it('matches renamed entity ids when a spawn egg creates a baby', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(
                        new ContainerEntry({ item: new Item({ name: 'minecraft:villager_spawn_egg' }), count: 1 })
                    );
                const villager = live.runtime.spawn('minecraft:villager_v2', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (villager === undefined) throw new Error('vanilla content declares no villager');
                expect(villager.instance.hasComponent('minecraft:spawn_egg_interaction')).toBe(true);
                const body = live.actors.actorOf(villager.id);
                if (body === undefined) throw new Error('the vanilla villager has no client-facing actor');

                await useHeldItemOnEntity(player, body.getRuntimeId());

                const child = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:villager_v2' && entity.id !== villager.id);
                expect(child?.position).toEqual(villager.position);
                expect(child?.instance.hasComponent('minecraft:is_baby')).toBe(true);
                const childBody = child && live.actors.actorOf(child.id);
                expect(childBody).toBeDefined();
                expect(childBody?.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.BABY))).toBe(true);
            });

            it('uses a zombie’s born event when its own spawn egg is used on it', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(
                        new ContainerEntry({ item: new Item({ name: 'minecraft:zombie_spawn_egg' }), count: 1 })
                    );
                const zombie = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (zombie === undefined) throw new Error('vanilla content declares no zombie');
                const body = live.actors.actorOf(zombie.id);
                if (body === undefined) throw new Error('the vanilla zombie has no client-facing actor');

                await useHeldItemOnEntity(player, body.getRuntimeId());

                const baby = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:zombie' && entity.id !== zombie.id);
                expect(baby?.instance.hasComponent('minecraft:is_baby')).toBe(true);
                const babyBody = baby && live.actors.actorOf(baby.id);
                expect(babyBody?.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.BABY))).toBe(true);
            });

            it(
                'keeps a spawn-egg zombie baby moving after spawning inside its parent',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();

                    const player = addPlayer(18, 0);
                    player.getPlayer().gamemode = Gametype.SURVIVAL;
                    Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                    player
                        .getInventory()
                        .setItemInHand(
                            new ContainerEntry({ item: new Item({ name: 'minecraft:zombie_spawn_egg' }), count: 1 })
                        );
                    const parent = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (parent === undefined) throw new Error('vanilla content declares no zombie');
                    const body = live.actors.actorOf(parent.id);
                    if (body === undefined) throw new Error('the vanilla zombie has no client-facing actor');

                    await useHeldItemOnEntity(player, body.getRuntimeId());

                    const baby = live.runtime
                        .entities()
                        .toArray()
                        .find((entity) => entity.identifier === 'minecraft:zombie' && entity.id !== parent.id);
                    if (baby === undefined) throw new Error('the matching spawn egg created no baby zombie');
                    expect(baby.position).toEqual(parent.position);

                    await run(120);

                    expect(parent.target).toBe(Number(player.getRuntimeId()));
                    expect(baby.target).toBe(Number(player.getRuntimeId()));
                    expect(parent.body.stuck).toBe(false);
                    expect(baby.body.stuck).toBe(false);
                    expect(parent.position.x > 4 || baby.position.x > 4).toBe(true);
                }
            );

            it(
                'keeps a crowd of spawn-egg zombie babies moving toward a survival player',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();
                    startAtNight();

                    const player = addPlayer(18, 0);
                    player.getPlayer().gamemode = Gametype.SURVIVAL;
                    Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                    player
                        .getInventory()
                        .setItemInHand(
                            new ContainerEntry({ item: new Item({ name: 'minecraft:zombie_spawn_egg' }), count: 24 })
                        );
                    const parent = live.runtime.spawn('minecraft:zombie', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (parent === undefined) throw new Error('vanilla content declares no zombie');
                    const body = live.actors.actorOf(parent.id);
                    if (body === undefined) throw new Error('the vanilla zombie has no client-facing actor');

                    for (let egg = 0; egg < 24; egg += 1) await useHeldItemOnEntity(player, body.getRuntimeId());

                    const zombies = live.runtime
                        .entities()
                        .toArray()
                        .filter((entity) => entity.identifier === 'minecraft:zombie');
                    expect(zombies).toHaveLength(25);
                    expect(zombies.filter((entity) => entity.instance.hasComponent('minecraft:is_baby'))).toHaveLength(
                        24
                    );
                    expect(zombies.every((entity) => entity.position.x === parent.position.x)).toBe(true);

                    await run(200);

                    expect(zombies.every((entity) => entity.target === Number(player.getRuntimeId()))).toBe(true);
                    expect(zombies.every((entity) => !entity.body.stuck)).toBe(true);
                    expect(zombies.every((entity) => entity.position.x > 4)).toBe(true);
                }
            );

            it('spawns a baby when a matching spawn egg is used on a mob', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                player
                    .getInventory()
                    .setItemInHand(
                        new ContainerEntry({ item: new Item({ name: 'minecraft:sheep_spawn_egg' }), count: 1 })
                    );
                expect(live.runtime.content().items.types.get('minecraft:sheep_spawn_egg')?.params(entityData)).toEqual(
                    {
                        id: 'minecraft:sheep'
                    }
                );
                const sheep = live.runtime.spawn('minecraft:sheep', { x: 0.5, y: GROUND_Y, z: 0.5 });
                if (sheep === undefined) throw new Error('vanilla content declares no sheep');
                expect(sheep.instance.hasComponent('minecraft:spawn_egg_interaction')).toBe(true);
                const body = live.actors.actorOf(sheep.id);
                if (body === undefined) throw new Error('the vanilla sheep has no client-facing actor');
                await useHeldItemOnEntity(player, body.getRuntimeId());

                const lamb = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:sheep' && entity.id !== sheep.id);
                expect(lamb?.position).toEqual(sheep.position);
                expect(lamb?.instance.hasComponent('minecraft:is_baby')).toBe(true);
            });

            it('spawns each vanilla spawn egg interaction’s declared offspring', { timeout: 180_000 }, async () => {
                useVanillaContent();

                const content = live.runtime.content();
                const { bedrockEntityIdentifierOf } = await import('../identifierMapping');
                const isRecord = (value: unknown): value is Record<string, unknown> =>
                    value !== null && typeof value === 'object' && !Array.isArray(value);
                const eggByEntity = new Map<string, string>();
                for (const [itemIdentifier, itemType] of content.items.types) {
                    const data = itemType.params(entityData);
                    if (data === undefined || typeof data !== 'object' || data === null || !('id' in data)) continue;
                    if (typeof data.id !== 'string') continue;

                    const identifier = bedrockEntityIdentifierOf(data.id, (candidate) =>
                        content.entities.registry.has(candidate)
                    );
                    if (identifier !== undefined && !eggByEntity.has(identifier))
                        eggByEntity.set(identifier, itemIdentifier);
                }

                const eggTargets = [...content.entities.registry].filter(
                    ([, type]) =>
                        type.declaredComponents.includes('minecraft:spawn_egg_interaction') &&
                        eggByEntity.has(type.identifier)
                );
                const player = addPlayer(2, 2);
                Object.assign(player.getActor()!, { inventory: new HumanInventory() });

                for (const [identifier] of eggTargets) {
                    const egg = eggByEntity.get(identifier);
                    if (egg === undefined)
                        throw new Error(`${identifier} has spawn egg interaction data but no matching egg`);

                    const parent = live.runtime.spawn(identifier, { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (parent === undefined) throw new Error(`vanilla content declares no ${identifier}`);
                    expect(parent.instance.hasComponent('minecraft:spawn_egg_interaction')).toBe(true);

                    const body = live.actors.actorOf(parent.id);
                    if (body === undefined) throw new Error(`${identifier} has no client-facing actor`);
                    const offspringData = parent.instance.componentParams('minecraft:offspring_data');
                    const offspringPairs = isRecord(offspringData) ? offspringData.offspring_pairs : undefined;
                    const offspringName = isRecord(offspringPairs) ? offspringPairs[identifier] : undefined;
                    if (typeof offspringName !== 'string')
                        throw new Error(`${identifier} has spawn egg interaction data but no offspring pair`);
                    const expectedChildIdentifier = bedrockEntityIdentifierOf(offspringName, (candidate) =>
                        content.entities.registry.has(candidate)
                    );
                    if (expectedChildIdentifier === undefined)
                        throw new Error(`${identifier} declares unknown offspring ${offspringName}`);
                    player
                        .getInventory()
                        .setItemInHand(new ContainerEntry({ item: new Item({ name: egg }), count: 1 }));
                    const existingIds = new Set(
                        live.runtime
                            .entities()
                            .toArray()
                            .map((entity) => entity.id)
                    );

                    await useHeldItemOnEntity(player, body.getRuntimeId());

                    const offspring = live.runtime
                        .entities()
                        .toArray()
                        .find((entity) => !existingIds.has(entity.id));
                    expect(offspring?.identifier).toBe(expectedChildIdentifier);
                    const offspringType = content.entities.registry.get(expectedChildIdentifier);
                    if (offspringType?.declaredComponents.includes('minecraft:is_baby')) {
                        expect(offspring?.instance.hasComponent('minecraft:is_baby'), identifier).toBe(true);
                        const offspringBody = offspring && live.actors.actorOf(offspring.id);
                        expect(offspringBody?.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.BABY))).toBe(
                            true
                        );
                    } else {
                        expect(offspring && live.actors.actorOf(offspring.id)).toBeDefined();
                    }
                }

                expect(eggTargets.length).toBeGreaterThan(0);
            });

            it('uses vanilla offspring pairs when two frogs breed', { timeout: 180_000 }, () => {
                useVanillaContent();

                const first = live.runtime.spawn('minecraft:frog', { x: 0.5, y: GROUND_Y, z: 0.5 });
                const second = live.runtime.spawn('minecraft:frog', { x: 1.5, y: GROUND_Y, z: 0.5 });
                if (first === undefined || second === undefined) throw new Error('vanilla content declares no frog');
                const mate = live.runtime.mobById(second.id);
                if (mate === undefined) throw new Error('the second vanilla frog has no goal view');
                live.runtime.setInLove(first.id, 600);
                live.runtime.setInLove(second.id, 600);

                live.runtime.breedWith(first.body, mate);

                const tadpole = live.runtime
                    .entities()
                    .toArray()
                    .find((entity) => entity.identifier === 'minecraft:tadpole');
                expect(tadpole?.instance.hasComponent('minecraft:is_baby')).toBe(true);
                expect(
                    live.actors
                        .actorOf(tadpole?.id ?? 0)
                        ?.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.BABY))
                ).toBe(true);
            });

            it(
                'uses adult spawning for matching eggs when the entity data has no baby interaction',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();

                    const player = addPlayer(2, 2);
                    Object.assign(player.getActor()!, { inventory: new HumanInventory() });
                    player
                        .getInventory()
                        .setItemInHand(
                            new ContainerEntry({ item: new Item({ name: 'minecraft:creeper_spawn_egg' }), count: 1 })
                        );
                    const creeper = live.runtime.spawn('minecraft:creeper', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (creeper === undefined) throw new Error('vanilla content declares no creeper');
                    expect(creeper.instance.hasComponent('minecraft:spawn_egg_interaction')).toBe(false);
                    const body = live.actors.actorOf(creeper.id);
                    if (body === undefined) throw new Error('the vanilla creeper has no client-facing actor');

                    await useHeldItemOnEntity(player, body.getRuntimeId());

                    const newCreeper = live.runtime
                        .entities()
                        .toArray()
                        .find((entity) => entity.identifier === 'minecraft:creeper' && entity.id !== creeper.id);
                    expect(newCreeper?.position).toEqual(creeper.position);
                    expect(newCreeper?.instance.hasComponent('minecraft:is_baby')).toBe(false);
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

                expect(pig.instance.goals.names()).toContain('minecraft:behavior.float');
                // Buoyancy may lift the pig out of the fluid before the final sample.
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

            it(
                'uses Java ground water costs without treating water as solid support',
                { timeout: 180_000 },
                async () => {
                    useVanillaContent();
                    startAtNight();

                    // Span every loaded z coordinate so a ground walker has no dry detour.
                    for (let chunkZ = -LOADED_RADIUS; chunkZ <= LOADED_RADIUS; chunkZ += 1) {
                        for (let x = 4; x <= 8; x += 1) {
                            const chunk = world.getLoadedChunk(x >> 4, chunkZ);
                            if (chunk === null)
                                throw new Error(
                                    `the vanilla path test chunk for x=${x}, chunkZ=${chunkZ} was not loaded`
                                );
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

                    expect(navigator.canReach({ x: 5.5, y: FLOOR_Y - 1.5, z: 5.5 }, 0)).toBe(false);
                    expect(navigator.canReach({ x: 10.5, y: GROUND_Y, z: 2.5 })).toBe(false);

                    const swimmingPig = live.runtime.spawn('minecraft:pig', { x: 5.5, y: FLOOR_Y + 0.5, z: 5.5 });
                    if (swimmingPig === undefined) throw new Error('the vanilla content declares no second pig');
                    await live.tick(1);

                    const pigBody = live.actors.actorOf(swimmingPig.id);
                    if (pigBody === undefined) throw new Error('the swimming pig has no store actor');
                    expect(swimmingPig.body.conditions.has('in_water')).toBe(true);
                    expect(swimmingPig.instance.goals.runningGoals()).toContain('minecraft:behavior.float');
                    expect(pigBody.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SWIMMING))).toBe(true);

                    const player = addPlayer(10, 2);
                    const zombieWalker = live.runtime.spawn('minecraft:zombie', { x: 2.5, y: GROUND_Y, z: 2.5 });
                    if (zombieWalker === undefined) throw new Error('the vanilla content declares no zombie');
                    expect(navigationProfile(zombieWalker.instance).isAmphibious).toBe(false);
                    expect(navigationProfile(zombieWalker.instance).canFloat).toBe(false);
                    for (let tick = 2; tick <= 60; tick += 1) await live.tick(tick);

                    const body = live.actors.actorOf(zombieWalker.id);
                    if (body === undefined) throw new Error('the zombie has no store actor');
                    expect(zombieWalker.target).toBe(Number(player.getRuntimeId()));
                    expect(zombieWalker.position.x).toBeLessThan(4);
                    expect(zombieWalker.position.y).toBe(GROUND_Y);
                    expect(zombieWalker.body.conditions.has('in_water')).toBe(false);
                    expect(body.isOnGround()).toBe(true);
                    expect(body.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SWIMMING))).toBe(false);
                }
            );

            it(
                'does not choose water as a random stroll destination when vanilla data says avoid_water',
                { timeout: 180_000 },
                () => {
                    useVanillaContent();

                    const chunk = world.getLoadedChunk(0, 0);
                    if (chunk === null) throw new Error('the vanilla random stroll test chunk was not loaded');
                    for (let x = 1; x <= 3; x += 1) chunk.setBlockRuntimeId(x, GROUND_Y, 0, idOf('minecraft:water'));

                    const pig = live.runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND_Y, z: 0.5 });
                    if (pig === undefined) throw new Error('the vanilla content declares no pig');
                    const profile = navigationProfile(pig.instance);
                    expect(profile.avoidWater).toBe(true);

                    const navigator = new Navigator({
                        actuator: live.runtime.actuatorFor(pig.instance),
                        navigation: () => live.runtime.navigation(),
                        profile: () => profile
                    });
                    const draws = [0.625, 0.5, 0.5, 1, 0.5, 0.5];

                    expect(navigator.randomTarget(4, 0, () => draws.shift() ?? 0.5)).toEqual({
                        x: 4.5,
                        y: GROUND_Y,
                        z: 0.5
                    });
                }
            );
        }
    );
});
