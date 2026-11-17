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
import type { EntityPosition } from '@jsprismarine/entities';
import type { VillagerRaidEffect, VillagerRaidState } from '@jsprismarine/entity-brains';
import type { Definitions } from '@jsprismarine/packs';

import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import type { ContentOptions } from '../../content/ContentOptions';
import { builtInEntityDefinitions, fixtureItemDefinitions } from '../../content/testing';
import { singleDimension } from '../../content/world/adapter';
import type { Difficulty } from '../../content/world/adapter';
import type {
    ContentBlock,
    ContentEntity,
    ContentItemDrop,
    ContentPosition,
    ContentTickScheduler,
    RandomSource,
    ServerWorldAdapter
} from '../../content/world/adapter';
import { gameRuleSpellings } from '../../content/world/gameRules';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { entityContentGroups } from '../contentAdapter';
import type { DataEntity } from './DataEntity';
import { ITEM_COMPONENT } from './droppedItems';
import { EntityRuntime } from './EntityRuntime';
import { EYE_OF_ENDER_SIGNAL_COMPONENT } from './eyeOfEnderSignals';
import { HANGING_COMPONENT } from './hangingEntities';
import type { ContentItemEntity, DamageCommit, EntityHostFacts, EntityWorldFacts } from './host';

/**
 * The blocks the entity fixture declares.
 *
 * A floor, an air block to walk through, a lamp to break and a bed, which is
 * the block Java's `PoiTypes` makes a home and so the one the sleep and
 * shelter goals search for, and a ladder and a cobweb to move through.
 */
export const FIXTURE_BLOCKS = [
    'minecraft:air',
    'minecraft:stone',
    'minecraft:redstone_lamp',
    'minecraft:bed',
    'minecraft:ladder',
    'minecraft:web'
] as const;

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
        ['minecraft:redstone_lamp', new BlockStateModel([])],
        ['minecraft:bed', new BlockStateModel([])],
        ['minecraft:ladder', new BlockStateModel([])],
        ['minecraft:web', new BlockStateModel([])]
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

/** The painting variants the entity fixture carries: id, width and height. */
const FIXTURE_PAINTINGS: readonly (readonly [string, number, number])[] = [
    ['minecraft:kebab', 1, 1],
    ['minecraft:aztec', 1, 1],
    ['minecraft:pool', 2, 1]
];

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
                definitionOf(
                    'blocks',
                    identifier,
                    blockFile(
                        identifier,
                        1.5,
                        identifier === 'minecraft:air' ||
                            identifier === 'minecraft:ladder' ||
                            identifier === 'minecraft:web'
                    )
                )
            ])
        ),
        entities: new Map([
            ...builtInEntityDefinitions(),
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
        // Three of Java's painting variants, the 1 by 1 kebab and aztec and the 2 by 1 pool,
        // which the `minecraft:placeable` tag lets a placed painting draw.
        paintingVariants: new Map(
            FIXTURE_PAINTINGS.map(([id, width, height]) => [
                id,
                definitionOf('paintingVariants', id, { asset_id: id, width, height })
            ])
        ),
        tags: new Map([
            [
                'painting_variant/minecraft:placeable',
                definitionOf('tags', 'painting_variant/minecraft:placeable', {
                    values: FIXTURE_PAINTINGS.map(([id]) => id)
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
    /**
     * The values the world's random source replays, or the source itself, for a test that
     * rewinds or rewrites its draws between steps.
     */
    readonly random?: readonly number[] | RandomSource;
    /** The players the host reports. */
    readonly players?: readonly ContentEntity[];
    /** A fixed light level for the world, used by entity filter regressions. */
    readonly lightLevel?: number;
    readonly dayTime?: number;
    readonly gameTime?: number;
    /** The world difficulty, normal when left out; {@link TestEntityWorld.difficulty} changes it later. */
    readonly difficulty?: Difficulty;
    /** The inhabited time every chunk reports, in ticks; 0 when left out. */
    readonly inhabitedTime?: number;
    /**
     * The game rules this world carries, keyed by any spelling the
     * `@jsprismarine/commands` registry knows.
     *
     * A rule left out is one the world never registered, which every reader
     * treats as the rule's default. `src/content/world/gameRules.ts` names the
     * ones the content path reads.
     */
    readonly gameRules?: Readonly<Record<string, boolean | number>>;
    /** The raid state this world reports to villagers. */
    readonly villagerRaidState?: VillagerRaidState;
    /** Blocks at or east of this x read as unloaded. */
    readonly unloadedFromX?: number;
    /**
     * Whether the world answers `runtimeIdAt`, numbering each block identifier the first time it
     * is asked. Off by default, because a block access with runtime ids takes other paths in the
     * runtime's block caches.
     */
    readonly runtimeIds?: boolean;
    /**
     * Whether the world answers `skyLight`, with the open sky's 15 above the floor where no placed
     * block stands overhead, and 0 under a placed block and at and below the floor. Off by
     * default, because a sky makes daylight burn the mobs that burn in it.
     */
    readonly skyLight?: boolean;
}

/** A flat stone world with air above it, and a recording host. */
export class TestEntityWorld {
    /** Everything dropped in this world, in the order it was dropped. */
    public readonly drops: { position: ContentPosition; item: ContentItemDrop }[] = [];

    /** Everything played in this world, in the order it was played. */
    public readonly sounds: string[] = [];

    /** Every particle emitted in this world, in the order it was emitted. */
    public readonly particles: string[] = [];

    /** Every level event played in this world, in the order it was played. */
    public readonly levelEvents: { at: ContentPosition; event: number; data: number }[] = [];

    /** Every game event the world received, in the order it was emitted. */
    public readonly gameEvents: { event: string; at: ContentPosition; sourceId: number | undefined }[] = [];

    /** Every event an entity executed on its home block. */
    public readonly entityEvents: {
        at: ContentPosition;
        source: ContentEntity;
        name: string;
    }[] = [];

    /** Every blow the host was asked to deal to something outside the entity index. */
    public readonly hits: {
        id: number;
        amount: number;
        cause: string;
        sourceId: number | undefined;
        deathMessageOverride?: string;
    }[] = [];

    /** Sonic-boom hits routed to host-owned entities. */
    public readonly sonicBoomHits: {
        id: number;
        amount: number;
        sourceId: number;
        impulse: ContentPosition;
    }[] = [];

    /** Raid effects requested by villager brains. */
    public readonly villagerRaidEffects: { id: number; effect: VillagerRaidEffect }[] = [];

    /** Data-driven entities asked to play their attack sound. */
    public readonly attackSounds: number[] = [];

    /** Entities whose death animation the host was asked to announce. */
    public readonly deathAnimations: number[] = [];

    /** Every damage commit the host heard, in order, as the advancement triggers hear them. */
    public readonly commits: DamageCommit[] = [];

    /** A synchronous host-side read a test can make while the host hears a commit. */
    public onCommit: ((commit: DamageCommit) => void) | undefined;

    /** The players the host reports, which a test replaces between ticks. */
    public players: readonly ContentEntity[];
    /** The tags of the one biome the world is, which a test changes between ticks; the plains' name alone by default. */
    public biomeTags: readonly string[] = ['minecraft:plains'];
    /** The world difficulty, which a test changes between ticks. */
    public difficulty: Difficulty;
    /** Game rules a test set after building the world, read before {@link TestWorldOptions.gameRules}. */
    public readonly gameRules = new Map<string, boolean | number>();
    private readonly runtimeIds = new Map<string, number>();
    /** The item each store player holds in its main hand, by runtime id. */
    public readonly held = new Map<number, string>();
    /** Every meal a store player finished, in order. */
    public readonly meals: { playerId: number; item: string }[] = [];
    /** Every dropped stack given to a player, in order, with the taker and the stack's id. */
    public readonly given: { playerId: number; itemId: number; item: ContentItemDrop }[] = [];
    /** How many more items each player's inventory takes, by runtime id; unlimited when absent. */
    public readonly room = new Map<number, number>();
    /** Every stack size the host was told about, in order. */
    public readonly stackChanges: { itemId: number; count: number }[] = [];
    /** A function a test sets to make giving an item throw, which fails the item's update. */
    public onGive: (() => void) | undefined;
    /** Number of host player-list reads, used to assert the runtime's tick snapshot. */
    public playerListReads = 0;
    /** A synchronous host-side player mutation a test can perform after damage. */
    public onHurt: ((id: number) => void) | undefined;
    /** The raid state the host reports, which a test may replace between ticks. */
    public villagerRaidState: VillagerRaidState | undefined;

    /** Blocks a test placed, over the flat floor. */
    private readonly placed = new Map<string, ContentBlock>();
    /** The heights of the blocks other than air a test placed, by column, for the sky light. */
    private readonly roofs = new Map<string, Set<number>>();
    private blockRevision = 0;

    /** The item stacks still lying on the ground, by runtime id. */
    private readonly lying = new Map<number, ContentItemEntity>();

    private nextItemId = 1;
    private gameTimeTicks: number;
    private dayTimeTicks: number;

    private readonly options: TestWorldOptions;

    public constructor(options: TestWorldOptions = {}) {
        this.options = options;
        this.players = options.players ?? [];
        this.difficulty = options.difficulty ?? 'normal';
        this.villagerRaidState = options.villagerRaidState;
        this.gameTimeTicks = options.gameTime ?? 0;
        this.dayTimeTicks = options.dayTime ?? 0;
    }

    /** The random source a world view draws from: the one the test gave, or a fresh replay of its values. */
    private randomSource(): RandomSource {
        const random = this.options.random ?? [0.5];
        return 'nextFloat' in random ? random : scriptedRandom(random);
    }

    /** Advances the test world's clocks together, as one server tick does. */
    public advance(ticks = 1): void {
        this.gameTimeTicks += ticks;
        this.dayTimeTicks = (this.dayTimeTicks + ticks) % 24000;
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
                gameTime: () => this.gameTimeTicks,
                dayTime: () => this.dayTimeTicks,
                difficulty: () => this.difficulty,
                inhabitedTime: () => this.options.inhabitedTime ?? 0,
                weather: () => 'clear',
                isRainingAt: () => false,
                spawnPosition: () => ({ x: 0, y: FLOOR_Y + 1, z: 0 }),
                gameRule: (name) => this.gameRuleOf(name)
            },
            blocks: {
                get: (at) => this.blockAt(at),
                ...(this.options.runtimeIds === true
                    ? {
                          runtimeIdAt: (at: ContentPosition) => {
                              const block = this.blockAt(at);
                              return block === undefined ? undefined : this.runtimeIdOf(block.identifier);
                          }
                      }
                    : {}),
                blockRevision: () => this.blockRevision,
                set: (at, block) => this.place(at, block),
                notifyNeighbors: () => undefined,
                data: () => undefined,
                setData: () => undefined,
                executeEntityEvent: (at, source, name) => this.entityEvents.push({ at, source, name }),
                light: (at) =>
                    this.options.lightLevel ??
                    (at.y <= FLOOR_Y ? 0 : this.options.skyLight === true ? this.shadedSkyLight(at) : 15),
                ...(this.options.skyLight === true
                    ? { skyLight: (at: ContentPosition) => (at.y > FLOOR_Y && !this.roofed(at) ? 15 : 0) }
                    : {}),
                power: () => 0,
                isLoaded: () => true,
                surfaceY: () => FLOOR_Y + 1,
                biome: () => 'minecraft:plains',
                biomeTags: () => this.biomeTags
            },
            effects: {
                playSound: (_at, sound) => this.sounds.push(sound),
                spawnParticle: (_at, particle) => this.particles.push(particle),
                emitGameEvent: (event, at, sourceId) => this.gameEvents.push({ event, at, sourceId })
            },
            random: this.randomSource()
        };
    }

    /**
     * The facts about entities the runtime's index does not hold.
     *
     * Dropped items are an index of their own here, which is what a server
     * with an item subsystem supplies: `drop` puts one in and `takeItem`
     * removes or splits a stack, so a pickup goal has something real to pick up.
     */
    public get host(): EntityHostFacts {
        return {
            players: () => {
                this.playerListReads += 1;
                return this.players;
            },
            drop: (position, item) => {
                this.drops.push({ position, item });
                this.lying.set(this.nextItemId, { id: this.nextItemId, position, item });
                this.nextItemId += 1;
            },
            items: () => [...this.lying.values()],
            takeItem: (id, count) => {
                const found = this.lying.get(id);
                if (found === undefined) return undefined;

                const takenCount = Math.min(found.item.count, count ?? found.item.count);
                if (takenCount <= 0) return undefined;
                const remaining = found.item.count - takenCount;
                if (remaining === 0) this.lying.delete(id);
                else this.lying.set(id, { ...found, item: { ...found.item, count: remaining } });
                return { ...found.item, count: takenCount };
            },
            heldItemOf: (playerId) => this.held.get(playerId),
            finishMeal: (playerId, item) => void this.meals.push({ playerId, item }),
            givePlayerItem: (playerId, itemId, item) => {
                this.onGive?.();
                const room = this.room.get(playerId) ?? Number.POSITIVE_INFINITY;
                const fits = Math.min(room, item.count);
                if (fits <= 0) return item.count;
                this.room.set(playerId, room - fits);
                this.given.push({ playerId, itemId, item: { ...item, count: fits } });
                return item.count - fits;
            },
            itemStackChanged: (itemId, count) => this.stackChanges.push({ itemId, count }),
            playSoundAt: (_at, sound) => this.sounds.push(sound),
            levelEvent: (at, event, data) => this.levelEvents.push({ at, event, data }),
            hurt: (id, amount, cause, sourceId, deathMessageOverride) => {
                this.hits.push({
                    id,
                    amount,
                    cause,
                    sourceId,
                    ...(deathMessageOverride === undefined ? {} : { deathMessageOverride })
                });
                this.onHurt?.(id);
            },
            applySonicBoom: (id, amount, sourceId, impulse) =>
                this.sonicBoomHits.push({ id, amount, sourceId, impulse }),
            playerIdentityOf: (id) => `player-${id}`,
            villagerRaidStateAt: () => this.villagerRaidState,
            villagerRaidEffect: (id, effect) => this.villagerRaidEffects.push({ id, effect }),
            attackSound: (id) => this.attackSounds.push(id),
            startDeathAnimation: (id) => this.deathAnimations.push(id),
            damageCommitted: (commit) => {
                this.commits.push(commit);
                this.onCommit?.(commit);
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

    /**
     * A runtime id for a block identifier, numbered in the order a test first asks, which is all
     * a test world needs of one: the same block gets the same id.
     */
    public runtimeIdOf(identifier: string): number {
        const known = this.runtimeIds.get(identifier);
        if (known !== undefined) return known;
        const id = this.runtimeIds.size + 1;
        this.runtimeIds.set(identifier, id);
        return id;
    }

    /** Replaces one block, so a test can wall a path finder in. */
    public setBlock(at: ContentPosition, identifier: string, states: ContentBlock['states'] = {}): void {
        this.place(at, { identifier, states });
    }

    private place(at: ContentPosition, block: ContentBlock): void {
        this.placed.set(keyOf(at), block);
        this.blockRevision += 1;
        const column = `${at.x},${at.z}`;
        const heights = this.roofs.get(column) ?? new Set<number>();
        if (block.identifier === 'minecraft:air') heights.delete(at.y);
        else heights.add(at.y);
        if (heights.size === 0) this.roofs.delete(column);
        else this.roofs.set(column, heights);
    }

    /** Whether a block a test placed stands anywhere above a position, which shades it from the sky. */
    /**
     * The sky light under a roof, which spreads in from the nearest column open to the sky and
     * loses a level a block, as Java's sky light does along a free path. Walls are not counted, so
     * a roofed spot is as bright as its horizontal distance to open sky allows.
     */
    private shadedSkyLight(at: ContentPosition): number {
        if (!this.roofed(at)) return 15;
        for (let distance = 1; distance < 15; distance += 1)
            for (let dx = -distance; dx <= distance; dx += 1) {
                const dz = distance - Math.abs(dx);
                if (!this.roofed({ ...at, x: at.x + dx, z: at.z + dz })) return 15 - distance;
                if (dz !== 0 && !this.roofed({ ...at, x: at.x + dx, z: at.z - dz })) return 15 - distance;
            }
        return 0;
    }

    private roofed(at: ContentPosition): boolean {
        const heights = this.roofs.get(`${at.x},${at.z}`);
        return heights !== undefined && [...heights].some((y) => y > at.y);
    }

    /**
     * One game rule, found under any spelling of its name.
     *
     * The same resolution the live adapter does, so a test may write
     * `mobGriefing` where the runtime asks for `minecraft:mob_griefing`.
     */
    private gameRuleOf(name: string): boolean | number | undefined {
        const rules = this.options.gameRules;
        for (const spelling of gameRuleSpellings(name)) {
            const value = this.gameRules.get(spelling) ?? rules?.[spelling];
            if (value !== undefined) return value;
        }
        return undefined;
    }

    /** The block at a position: whatever a test placed, else floor below and air above. */
    private blockAt(at: ContentPosition): ContentBlock | undefined {
        if (this.options.unloadedFromX !== undefined && at.x >= this.options.unloadedFromX) return undefined;
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
    /** Every entity the runtime announced, in spawn order. */
    readonly spawned: readonly DataEntity[];
    /** Every entity the runtime took out, with the reason it gave. */
    readonly removed: readonly { entity: DataEntity; reason: string }[];
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
 *
 * @param nextId - Draws runtime ids; the runtime counts from one when it is left out. A test
 *   that puts the fixture's entities beside a server's own passes one that keeps them apart.
 */
export const entityFixture = (
    world = new TestEntityWorld(),
    overrides: ContentOptions = {},
    extra: ExtraEntities = {},
    nextId?: () => number
): EntityFixture => {
    const reports: string[] = [];
    const spawned: DataEntity[] = [];
    const removed: { entity: DataEntity; reason: string }[] = [];
    let content: ServerContent | undefined;

    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the entity runtime was read before the content was built');
            return content;
        },
        world: world.world,
        host: world.host,
        report: (message) => reports.push(message),
        onSpawn: (entity) => spawned.push(entity),
        onRemove: (entity, reason) => removed.push({ entity, reason }),
        ...(nextId === undefined ? {} : { nextId })
    });

    const adapter: ServerWorldAdapter = {
        ...world.world,
        ticks: world.ticks,
        ...entityContentGroups(runtime)
    };

    content = buildServerContent(entityContentOptions({ world: singleDimension(adapter), ...overrides }, extra));
    return { content, runtime, world, adapter, reports, spawned, removed };
};

/**
 * Spawns one entity of any type the content declares, with the host state the types that need
 * one are given where the server spawns them: a falling block its block, a dropped stack a stack
 * and an eye of ender a flight. A bare spawn of either of the last two is refused, because
 * neither means anything without its state.
 *
 * @param runtime - The runtime to spawn into.
 * @param identifier - The entity type.
 * @param at - Where it starts.
 * @returns The entity, or undefined when the runtime refused it.
 */
export const spawnDeclared = (
    runtime: EntityRuntime,
    identifier: string,
    at: EntityPosition
): DataEntity | undefined => {
    const declared = runtime.content().entities.registry.get(identifier)?.declaredComponents ?? [];
    if (declared.includes(ITEM_COMPONENT))
        return runtime.droppedItems.spawn(at, { stack: { name: 'minecraft:stone', count: 1 } });
    if (declared.includes(EYE_OF_ENDER_SIGNAL_COMPONENT))
        return runtime.eyesOfEnder.launch(
            at,
            { x: at.x + 100, y: 0, z: at.z },
            { name: 'minecraft:ender_eye', count: 1 }
        );
    if (declared.includes('jsprismarine:falling_block'))
        return runtime.spawn(identifier, at, { data: { block: 'minecraft:stone' } });
    if (declared.includes(HANGING_COMPONENT)) {
        // A painting hangs only on a wall, as Java's `Painting.create` places one, so a stone wall
        // big enough for every variant goes up behind the block it faces south from.
        const cell = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
        for (let dx = -3; dx <= 3; dx += 1)
            for (let dy = -2; dy <= 3; dy += 1)
                runtime.world.blocks.set(
                    { x: cell.x + dx, y: cell.y + dy, z: cell.z - 1 },
                    { identifier: 'minecraft:stone', states: {} },
                    false
                );
        return runtime.spawn(identifier, at, { data: { facing: 'south' } });
    }
    return runtime.spawn(identifier, at);
};
