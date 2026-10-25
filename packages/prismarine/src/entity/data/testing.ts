/**
 * A world and a content set small enough to build in memory.
 *
 * `fixtureContentOptions` builds the real `ServerContent` out of a handful of
 * definitions; this adds the three things the entity runtime needs and the
 * fixture has no reason to carry: a passable block so a path finder has
 * somewhere to walk, entity definitions with goals and events on them, and a
 * flat world to put them in.
 *
 * Everything goes through the real loaders, the real component registry and
 * the real goal and brain packages. Nothing here is a mock of the runtime.
 */
import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';
import type { Definitions } from '@jsprismarine/packs';

import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import type { ContentOptions } from '../../content/ContentOptions';
import { fixtureItemDefinitions } from '../../content/testing';
import { singleDimension } from '../../content/world/adapter';
import type {
    ContentBlock,
    ContentEntity,
    ContentItemDrop,
    ContentPosition,
    ContentTickScheduler,
    RandomSource,
    ServerWorldAdapter
} from '../../content/world/adapter';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { entityContentGroups } from '../contentAdapter';
import { EntityRuntime } from './EntityRuntime';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from './host';

/** The blocks the entity fixture declares: a floor, a lamp and an air block to walk through. */
export const FIXTURE_BLOCKS = ['minecraft:air', 'minecraft:stone', 'minecraft:redstone_lamp'] as const;

/** The y the fixture world's stone floor sits at; everything above it is air. */
export const FLOOR_Y = 63;

/** One block file in the shape the `jsprismarine_vanilla` overlay writes. */
const blockFile = (identifier: string, hardness: number, passable: boolean): unknown => ({
    format_version: '1.26.20',
    'minecraft:block': {
        description: { identifier },
        components: {
            'minecraft:destructible_by_mining': { seconds_to_destroy: hardness },
            'minecraft:destructible_by_explosion': { explosion_resistance: hardness * 5 },
            'minecraft:collision_box': passable ? false : { origin: [-8, 0, -8], size: [16, 16, 16] },
            'minecraft:light_emission': 0,
            'minecraft:light_dampening': passable ? 0 : 15,
            'minecraft:friction': 0.6,
            'jsprismarine:block_properties': {
                friction: 0.6,
                random_tick: false,
                requires_correct_tool: true,
                push_reaction: 'push_pull',
                source: 'java'
            }
        }
    }
});

/** A palette of the three fixture blocks. */
export const entityFixturePalette = (): BlockPalette =>
    new BlockPalette([
        ['minecraft:air', new BlockStateModel([])],
        ['minecraft:stone', new BlockStateModel([])],
        ['minecraft:redstone_lamp', new BlockStateModel([])]
    ]);

/** One entity file, in the shape a behavior pack writes. */
export const entityFile = (identifier: string, body: Record<string, unknown>): unknown => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        ...body
    }
});

/**
 * The four entities the runtime's tests use.
 *
 * - `minecraft:cow` carries only stats, so the facts tests read numbers off it.
 * - `jsprismarine:wanderer` carries two goals that both want the move flag, at
 *   different priorities, which is what the scheduler arbitrates.
 * - `jsprismarine:hatchling` carries a spawn event that adds a component group,
 *   which is what `minecraft:entity_spawned` is for.
 * - `minecraft:goat` is one of the twenty brain mobs, so the brain tests have a
 *   type the brain registry knows.
 */
export const entityFixtureDefinitions = () =>
    new Map([
        [
            'minecraft:cow',
            definitionOf(
                'entities',
                'minecraft:cow',
                entityFile('minecraft:cow', {
                    components: {
                        'minecraft:health': { value: 10, max: 10 },
                        'minecraft:attack': { damage: 2 },
                        'minecraft:knockback_resistance': { value: 0.25 },
                        'minecraft:follow_range': { value: 24 },
                        'minecraft:movement': { value: 2.5 },
                        'minecraft:collision_box': { width: 0.9, height: 1.3 },
                        'minecraft:type_family': { family: ['cow', 'mob'] },
                        'minecraft:loot': { table: 'loot_tables/entities/cow.json' }
                    }
                })
            )
        ],
        [
            'jsprismarine:wanderer',
            definitionOf(
                'entities',
                'jsprismarine:wanderer',
                entityFile('jsprismarine:wanderer', {
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:movement': { value: 2.5 },
                        'minecraft:collision_box': { width: 0.6, height: 1.8 },
                        // Both goals are forced onto the move flag so the scheduler has to
                        // choose between them; priority 0 is the highest, as the docs state.
                        'minecraft:behavior.look_at_player': {
                            priority: 2,
                            control_flags: ['move'],
                            look_distance: 16,
                            probability: 1
                        },
                        'minecraft:behavior.random_stroll': {
                            priority: 6,
                            control_flags: ['move'],
                            interval: 0,
                            speed_multiplier: 1,
                            xz_dist: 4,
                            y_dist: 1
                        }
                    }
                })
            )
        ],
        [
            'jsprismarine:hatchling',
            definitionOf(
                'entities',
                'jsprismarine:hatchling',
                entityFile('jsprismarine:hatchling', {
                    components: { 'minecraft:health': { value: 4, max: 4 } },
                    component_groups: {
                        grown: { 'minecraft:health': { value: 12, max: 12 } },
                        hatched: { 'minecraft:type_family': { family: ['hatched'] } }
                    },
                    events: {
                        'minecraft:entity_spawned': { add: { component_groups: ['hatched'] } },
                        'minecraft:entity_born': { add: { component_groups: ['grown'] } },
                        'jsprismarine:named_spawn': { add: { component_groups: ['grown', 'hatched'] } }
                    }
                })
            )
        ],
        [
            'minecraft:villager_v2',
            definitionOf(
                'entities',
                'minecraft:villager_v2',
                entityFile('minecraft:villager_v2', {
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:movement': { value: 5 },
                        'minecraft:collision_box': { width: 0.6, height: 1.9 },
                        'minecraft:economy_trade_table': {
                            table: 'trading/economy_trades/farmer_trades.json',
                            display_name: 'entity.villager.farmer',
                            new_screen: true,
                            persist_trades: true
                        }
                    }
                })
            )
        ],
        [
            'minecraft:goat',
            definitionOf(
                'entities',
                'minecraft:goat',
                entityFile('minecraft:goat', {
                    components: {
                        'minecraft:health': { value: 10, max: 10 },
                        'minecraft:movement': { value: 2 },
                        'minecraft:collision_box': { width: 0.9, height: 1.3 }
                    }
                })
            )
        ]
    ]);

/** One entity type a test adds to the fixture, as the body of its behavior-pack file. */
export type ExtraEntities = Readonly<Record<string, Record<string, unknown>>>;

/**
 * The definitions the entity fixture composes to.
 *
 * @param extra - Entity files a test declares, keyed by identifier. They go
 *   through the same loader as the fixture's own, so a test that needs a mob
 *   with a particular goal on it writes the goal rather than a double.
 */
export const entityFixtureStack = (extra: ExtraEntities = {}): Definitions =>
    definitionsOf({
        blocks: new Map(
            FIXTURE_BLOCKS.map((identifier) => [
                identifier,
                definitionOf('blocks', identifier, blockFile(identifier, 1.5, identifier === 'minecraft:air'))
            ])
        ),
        entities: new Map([
            ...entityFixtureDefinitions(),
            ...Object.entries(extra).map(
                ([identifier, body]) =>
                    [identifier, definitionOf('entities', identifier, entityFile(identifier, body))] as const
            )
        ]),
        spawnRules: new Map([
            [
                'minecraft:cow',
                definitionOf('spawnRules', 'minecraft:cow', {
                    format_version: '1.8.0',
                    'minecraft:spawn_rules': {
                        description: { identifier: 'minecraft:cow', population_control: 'animal' },
                        conditions: [
                            {
                                'minecraft:spawns_on_surface': {},
                                'minecraft:brightness_filter': { min: 7, max: 15 },
                                'minecraft:weight': { default: 10 },
                                'minecraft:herd': { min_size: 1, max_size: 2 },
                                'minecraft:spawns_on_block_filter': 'minecraft:stone',
                                'minecraft:biome_filter': { test: 'has_biome_tag', value: 'minecraft:plains' }
                            }
                        ]
                    }
                })
            ]
        ]),
        tradeTables: new Map([
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
        ]),
        lootTablesJava: new Map([
            [
                'minecraft:entities/cow',
                definitionOf('lootTablesJava', 'minecraft:entities/cow', {
                    type: 'minecraft:entity',
                    pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:leather' }] }]
                })
            ]
        ])
    });

/** Content options that build the entity fixture without reading a file. */
export const entityContentOptions = (overrides: ContentOptions = {}, extra: ExtraEntities = {}): ContentOptions => ({
    load: () => ({ definitions: entityFixtureStack(extra), diagnostics: [] }),
    blockPalette: entityFixturePalette(),
    itemDefinitions: fixtureItemDefinitions(),
    ...overrides
});

/** A random source that replays the values a test wrote, then starts over. */
export const scriptedRandom = (values: readonly number[]): RandomSource => {
    let index = 0;
    const next = () => {
        const value = values[index % values.length] ?? 0;
        index += 1;
        return value;
    };
    return { nextFloat: next, nextInt: (bound) => (bound <= 0 ? 0 : Math.floor(next() * bound)) };
};

/** What a test says about the world it puts entities in. */
export interface TestWorldOptions {
    /** The values the world's random source replays. */
    readonly random?: readonly number[];
    /** The players the host reports. */
    readonly players?: readonly ContentEntity[];
    readonly dayTime?: number;
    readonly gameTime?: number;
}

/** A flat stone world with air above it, and a recording host. */
export class TestEntityWorld {
    /** Everything dropped in this world, in the order it was dropped. */
    public readonly drops: { position: ContentPosition; item: ContentItemDrop }[] = [];

    /** Everything played in this world, in the order it was played. */
    public readonly sounds: string[] = [];

    /** The players the host reports, which a test replaces between ticks. */
    public players: readonly ContentEntity[];

    /** Blocks a test placed, over the flat floor. */
    private readonly placed = new Map<string, ContentBlock>();

    /** The item stacks still lying on the ground, by runtime id. */
    private readonly lying = new Map<number, ContentItemEntity>();

    private nextItemId = 1;

    private readonly options: TestWorldOptions;

    public constructor(options: TestWorldOptions = {}) {
        this.options = options;
        this.players = options.players ?? [];
    }

    /** The groups the blocks, world and network subsystems own. */
    public get world(): EntityWorldFacts {
        return {
            level: {
                dimension: 'minecraft:overworld',
                minY: -64,
                maxY: 320,
                hasSkyLight: true,
                seaLevel: 62,
                seed: 0n,
                gameTime: () => this.options.gameTime ?? 0,
                dayTime: () => this.options.dayTime ?? 0,
                difficulty: () => 'normal',
                weather: () => 'clear',
                isRainingAt: () => false,
                spawnPosition: () => ({ x: 0, y: FLOOR_Y + 1, z: 0 })
            },
            blocks: {
                get: (at) => this.blockAt(at),
                set: (at, block) => {
                    this.placed.set(keyOf(at), block);
                },
                notifyNeighbors: () => undefined,
                data: () => undefined,
                setData: () => undefined,
                light: (at) => (at.y > FLOOR_Y ? 15 : 0),
                power: () => 0,
                isLoaded: () => true,
                surfaceY: () => FLOOR_Y + 1,
                biome: () => 'minecraft:plains',
                biomeTags: () => ['minecraft:plains']
            },
            effects: {
                playSound: (_at, sound) => this.sounds.push(sound),
                spawnParticle: () => undefined,
                emitGameEvent: () => undefined
            },
            random: scriptedRandom(this.options.random ?? [0.5])
        };
    }

    /**
     * The facts about entities the runtime's index does not hold.
     *
     * Dropped items are an index of their own here, which is what a server
     * with an item subsystem supplies: `drop` puts one in and `takeItem`
     * takes it out, so a pickup goal has something real to pick up.
     */
    public get host(): EntityHostFacts {
        return {
            players: () => this.players,
            drop: (position, item) => {
                this.drops.push({ position, item });
                this.lying.set(this.nextItemId, { id: this.nextItemId, position, item });
                this.nextItemId += 1;
            },
            items: () => [...this.lying.values()],
            takeItem: (id) => {
                const found = this.lying.get(id);
                this.lying.delete(id);
                return found?.item;
            },
            mobEventActive: () => false
        };
    }

    /** Puts an item stack on the ground, and hands back its runtime id. */
    public dropItem(position: ContentPosition, item: ContentItemDrop): number {
        const id = this.nextItemId;
        this.host.drop(position, item);
        return id;
    }

    /**
     * The tick scheduler, which no entity group reads.
     *
     * Present only so a test can assemble the whole `ServerWorldAdapter`; it
     * belongs to the world subsystem, which owns the real one.
     */
    public get ticks(): ContentTickScheduler {
        return { schedule: () => undefined, isScheduled: () => false, runsThisTick: () => false };
    }

    /** Replaces one block, so a test can wall a path finder in. */
    public setBlock(at: ContentPosition, identifier: string): void {
        this.placed.set(keyOf(at), { identifier, states: {} });
    }

    /** The block at a position: whatever a test placed, else floor below and air above. */
    private blockAt(at: ContentPosition): ContentBlock | undefined {
        const placed = this.placed.get(keyOf(at));
        if (placed !== undefined) return placed;
        return { identifier: at.y > FLOOR_Y ? 'minecraft:air' : 'minecraft:stone', states: {} };
    }
}

/** One block position as a map key. */
const keyOf = (at: ContentPosition): string => `${at.x},${at.y},${at.z}`;

/** A built fixture: the content, the runtime that drives it and the world it stands in. */
export interface EntityFixture {
    readonly content: ServerContent;
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
    readonly adapter: ServerWorldAdapter;
    /** Everything the runtime met and could not carry out. */
    readonly reports: readonly string[];
}

/**
 * Builds the content, the runtime and the adapter, wired the way the server
 * wires them.
 *
 * The three depend on each other in a ring: the content's goal components read
 * the `ai` group of the adapter, the adapter reads the runtime, and the
 * runtime reads the content. The ring is closed the same way
 * `buildServerContent` closes its own - the runtime holds a closure over the
 * content rather than the content itself, and nothing dereferences it until a
 * hook runs.
 */
export const entityFixture = (world = new TestEntityWorld(), overrides: ContentOptions = {}): EntityFixture => {
    const reports: string[] = [];
    let content: ServerContent | undefined;

    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the entity runtime was read before the content was built');
            return content;
        },
        world: world.world,
        host: world.host,
        report: (message) => reports.push(message)
    });

    const adapter: ServerWorldAdapter = {
        ...world.world,
        ticks: world.ticks,
        ...entityContentGroups(runtime)
    };

    content = buildServerContent(entityContentOptions({ world: singleDimension(adapter), ...overrides }));
    return { content, runtime, world, adapter, reports };
};
