import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
    EntityInstance,
    EntitySensorQuery,
    EntityTargetProximity,
    TransformRequest
} from '@jsprismarine/entities/entityInstance';
import type { SpawnCause } from '@jsprismarine/entities/eventEngine';
import type {
    EntityFlag,
    EntityMeasure,
    EntityNameSet,
    FilterContext,
    RandomSource
} from '@jsprismarine/entities/filterContext';
import type { EntityPosition, EntitySpawnRequest } from '@jsprismarine/entities/hooks';
import { MemoryModuleTypes } from '@jsprismarine/entity-brains/memory';
import { HOGLIN } from '@jsprismarine/entity-brains/mobs/hoglin';
import { PIGLIN } from '@jsprismarine/entity-brains/mobs/piglin';
import { BABY_VILLAGER_SCHEDULE, VILLAGER_SCHEDULE } from '@jsprismarine/entity-brains/mobs/villager';
import { javaBlockStateToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';
import { RAIDER_TABLE, RaidManager } from '@jsprismarine/prismarine/world/raid/RaidManager';
import type { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { pinnedJavaConstants } from '../javaClassFile.ts';
import { unpackVanillaDatapack } from '../javaDatapack.ts';
import { voxelGrid } from '@jsprismarine/entity-goals/navigation/voxelGrid';
import { javaMethodNumbers } from '../javaGoals.ts';
import { gameTicks, probeGoal, walkSpeeds } from './goalHarness.ts';
import { javaClassChain, javaEntityClassName, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import { realStack, serverContent } from '../serverStack.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring, field, mappedEntity, stringList, withNamespace } from './subjects.ts';

/**
 * Growth, breeding and lifecycle scenarios: babies growing up, feeding, breeding, the timed
 * conversions between mob types, and the components that lay, spawn or trade on a clock.
 *
 * Each scenario spawns the server's own resolved entity type with the real component registry,
 * drives it through the events and ticks Java would put it through, and reads what the
 * components asked the world to do.
 */

/** What one probed entity asked its world to do. */
interface Probe {
    readonly entity: EntityInstance;
    readonly transforms: TransformRequest[];
    readonly spawns: EntitySpawnRequest[];
    readonly removals: string[];
}

/** The world a probed entity sees. */
interface ProbeWorld {
    readonly cause?: SpawnCause;
    /** The boolean facts the entity's own filters read, such as `is_underwater`. */
    readonly flags?: Partial<Record<EntityFlag, boolean>>;
    /** The numeric facts the entity's own filters read, such as `rider_count`. */
    readonly measures?: Partial<Record<EntityMeasure, number>>;
    /** The name-set facts the entity's own filters read, such as `in_block`. */
    readonly names?: Partial<Record<EntityNameSet, readonly string[]>>;
    readonly difficulty?: string;
    readonly timeOfDay?: number;
    readonly random?: RandomSource;
    /** The current target's distance and visibility, read each tick by `minecraft:target_nearby_sensor`. */
    readonly target?: () => EntityTargetProximity | undefined;
    /** Records each search `minecraft:entity_sensor` asks the world for. */
    readonly sensorQueries?: EntitySensorQuery[];
}

/** A random source that always draws the same value, so a range's ends can be read exactly. */
const fixedRandom = (value: number): RandomSource => ({ next: () => value });

/**
 * Spawns one server entity type in a world that records what it asks for.
 *
 * @throws {Error} When the server declares no such type.
 */
const probe = (bedrock: string, world: ProbeWorld = {}): Probe => {
    const transforms: TransformRequest[] = [];
    const spawns: EntitySpawnRequest[] = [];
    const removals: string[] = [];
    const flags = world.flags ?? {};
    const names = world.names ?? {};
    const measures = world.measures ?? {};
    const context: FilterContext = {
        self: { flag: (name) => flags[name], names: (name) => names[name], measure: (name) => measures[name] },
        world: {
            difficulty: () => world.difficulty ?? 'normal',
            timeOfDay: () => world.timeOfDay ?? 6000,
            dimension: () => 'minecraft:overworld'
        }
    };
    const entity = serverContent().entities.types.spawn(bedrock, {
        cause: world.cause ?? 'spawned',
        environment: {
            filterContext: () => context,
            transform: (_entity, request) => transforms.push(request),
            spawnEntity: (_entity, request) => {
                spawns.push(request);
                return true;
            },
            remove: (_entity, reason) => removals.push(reason),
            ...(world.target === undefined ? {} : { targetProximity: world.target }),
            entitySensorCandidates: (_entity, query) => {
                world.sensorQueries?.push(query);
                return [];
            },
            ...(world.random === undefined ? {} : { random: world.random })
        }
    });
    return { entity, transforms, spawns, removals };
};

/** One component's saved clock on a probed entity, which is what the server would persist. */
const clockOf = (entity: EntityInstance, component: string): number | undefined => {
    const remaining = field(entity.componentState.snapshot()[component], 'remaining');
    return typeof remaining === 'number' ? remaining : undefined;
};

/** Ticks a probe until `done` holds, and returns how many ticks that took, or undefined past `limit`. */
const ticksUntil = (entity: EntityInstance, done: () => boolean, limit: number): number | undefined => {
    for (let tick = 1; tick <= limit; tick += 1) {
        entity.tick(false);
        if (done()) return tick;
    }
    return undefined;
};

/** The Bedrock item identifiers of every member of a Java item tag. */
const javaTagItems = (tag: string): readonly string[] =>
    serverContent()
        .tags.members('item', tag)
        .flatMap((javaItem) => {
            const mapped = javaItemToBedrock(javaItem);
            return mapped.kind === 'unknown' ? [] : [mapped.bedrock.identifier];
        });

/** A Java item as the server names it. */
const bedrockItem = (javaItem: string): string => {
    const mapped = javaItemToBedrock(javaItem);
    return mapped.kind === 'unknown' ? javaItem : mapped.bedrock.identifier;
};

/** Java's `AgeableMob.BABY_START_AGE`, the ticks a newborn takes to grow up. */
const BABY_START_AGE = 24000;

/** Java's `Sniffer.SNIFFER_BABY_START_AGE`, the one mob that overrides `AgeableMob.getBabyStartAge`. */
const SNIFFER_BABY_START_AGE = 48000;

/**
 * Java's `AgeableMob.getSpeedUpSecondsWhenFeeding`: a fed baby grows by a tenth of the seconds it
 * has left, truncated, computed in float the way Java does.
 */
const tenthOfRemaining = (ticksLeft: number): number => Math.trunc(Math.trunc(ticksLeft / 20) * Math.fround(0.1));

/** How one Java mob grows when a baby is fed: which items it eats, and how many seconds each one advances it. */
interface FeedingRule {
    readonly items: readonly string[];
    readonly seconds: (item: string, ticksLeft: number) => number;
}

/** Seconds per item from Java's `AbstractHorse.handleEating`, which every horse, donkey and mule runs. */
const HORSE_GROWTH_SECONDS: Readonly<Record<string, number>> = {
    'minecraft:wheat': 20,
    'minecraft:sugar': 30,
    'minecraft:hay_block': 180,
    'minecraft:apple': 60,
    'minecraft:carrot': 60,
    'minecraft:golden_carrot': 60,
    'minecraft:golden_apple': 240,
    'minecraft:enchanted_golden_apple': 240
};

/** Seconds per item from Java's `Llama.handleEating`, which the trader llama inherits. */
const LLAMA_GROWTH_SECONDS: Readonly<Record<string, number>> = { 'minecraft:wheat': 10, 'minecraft:hay_block': 90 };

/** A feeding rule that advances a fixed number of seconds per item, as Java's horses, llamas and camels do. */
const fixedGrowth = (table: Readonly<Record<string, number>>): FeedingRule => {
    const byBedrock = new Map(Object.entries(table).map(([item, seconds]) => [bedrockItem(item), seconds]));
    return { items: [...byBedrock.keys()], seconds: (item) => byBedrock.get(item) ?? 0 };
};

/** A feeding rule that advances a tenth of the time left, as `Animal.mobInteract` does with the mob's food tag. */
const tenthGrowth = (tag: string): FeedingRule => ({
    items: javaTagItems(tag),
    seconds: (_item, ticksLeft) => tenthOfRemaining(ticksLeft)
});

/**
 * How each Java baby grows when fed. A mob not listed eats nothing as a baby: Java's squid, glow
 * squid, villager and polar bear (whose `isFood` is always false) never take food to grow.
 */
const feedingRuleOf = (javaId: string): FeedingRule | undefined => {
    switch (javaId) {
        case 'minecraft:horse':
        case 'minecraft:donkey':
        case 'minecraft:mule':
            return fixedGrowth(HORSE_GROWTH_SECONDS);
        case 'minecraft:llama':
        case 'minecraft:trader_llama':
            return fixedGrowth(LLAMA_GROWTH_SECONDS);
        case 'minecraft:camel':
            // `Camel.handleEating` calls `ageUp(10)` for anything in the camel's food tag.
            return { items: javaTagItems('minecraft:camel_food'), seconds: () => 10 };
        case 'minecraft:dolphin':
            // `Dolphin.mobInteract` feeds a baby anything in `minecraft:fishes`.
            return tenthGrowth('minecraft:fishes');
        case 'minecraft:tadpole':
            return tenthGrowth('minecraft:frog_food');
        case 'minecraft:mooshroom':
            return tenthGrowth('minecraft:cow_food');
        case 'minecraft:squid':
        case 'minecraft:glow_squid':
        case 'minecraft:villager':
        case 'minecraft:polar_bear':
            return undefined;
        default: {
            const tag = `${javaId}_food`;
            return serverContent().tags.has('item', tag) ? tenthGrowth(tag) : undefined;
        }
    }
};

/** The items a server ageable component feeds the baby with, from every body the definition gives it. */
const serverFeedItems = (entity: EntityInstance): readonly string[] => {
    const items = field(entity.componentParams('minecraft:ageable'), 'feedItems');
    if (!Array.isArray(items)) return [];
    return items.flatMap((item: unknown) => {
        const identifier = typeof item === 'string' ? item : field(item, 'item');
        return typeof identifier === 'string' ? [withNamespace(identifier)] : [];
    });
};

/** Spawns a newborn of a type, so its baby group and growth clock are active. */
const newborn = (bedrock: string): Probe => probe(bedrock, { cause: 'born' });

/** One `minecraft:timer` body a server definition declares, with the group that carries it. */
interface TimerBody {
    /** The component group, or undefined for a base component. */
    readonly group: string | undefined;
    readonly event: string | undefined;
}

/** The event a `minecraft:timer` body fires when it runs out. */
const timerEvent = (body: unknown): string | undefined => {
    const down = field(body, 'time_down_event');
    const event = typeof down === 'string' ? down : field(down, 'event');
    return typeof event === 'string' ? event : undefined;
};

/** Every `minecraft:timer` body of a server entity type, in its base components and its groups. */
const timerBodies = (bedrock: string): readonly TimerBody[] => {
    const type = serverContent().entities.registry.get(bedrock);
    if (type === undefined) return [];
    const bodies: TimerBody[] = [];
    const base = type.entity.components.get('minecraft:timer');
    if (base !== undefined) bodies.push({ group: undefined, event: timerEvent(base) });
    for (const [group, components] of type.entity.componentGroups) {
        const body = components.get('minecraft:timer');
        if (body !== undefined) bodies.push({ group, event: timerEvent(body) });
    }
    return bodies;
};

/** Makes one component group active on a probed entity, last, so its components win. */
const activate = (entity: EntityInstance, group: string | undefined): void => {
    if (group === undefined) return;
    entity.restoreComponentGroups([...entity.activeComponentGroups().filter((active) => active !== group), group]);
};

/** Whether an event is waiting for the entity's next tick, which is where a component's raised event lands. */
const raised = (entity: EntityInstance, event: string): boolean =>
    entity.queued().some((effects) => effects.event === event);

/** Java's wait, in ticks, for what each Bedrock timer stands in for, keyed by the event the timer fires. */
const JAVA_TIMERS: Readonly<Record<string, { readonly ticks: readonly [number, number]; readonly java: string }>> = {
    'minecraft:sink': { ticks: [60, 60], java: 'AbstractBoat.BUBBLE_TIME over a downward bubble column' },
    pickup_item_delay_complete: { ticks: [60, 60], java: 'AllayAi.ITEM_PICKUP_COOLDOWN_DURATION' },
    'minecraft:unroll': { ticks: [80, 80], java: 'Armadillo.SCARE_CHECK_INTERVAL' },
    stop_panicking_after_fire: {
        ticks: [400, 400],
        java: 'BeehiveBlockEntity.MIN_TICKS_BEFORE_REENTERING_HIVE, the stay-out countdown of a bee a burning hive released'
    },
    perish_event: {
        ticks: [5, 1200],
        java: 'Bee.STING_DEATH_COUNTDOWN: from the fifth tick after stinging, a 1 in (1200 - ticks) chance every fifth tick'
    },
    calmed_down: { ticks: [400, 780], java: 'Bee.PERSISTENT_ANGER_TIME, 20 to 39 seconds' },
    find_flower_timeout: { ticks: [3600, 3600], java: 'Bee.TICKS_WITHOUT_NECTAR_BEFORE_GOING_HOME' },
    find_hive_timeout: { ticks: [2400, 2400], java: "Bee$BeeGoToHiveGoal's travel limit" },
    find_hive_event: { ticks: [200, 200], java: 'Bee.COOLDOWN_BEFORE_LOCATING_NEW_HIVE' },
    'minecraft:oxidize_copper': {
        ticks: [504000, 552000],
        java: 'CopperGolem.WEATHERING_TICK_FROM and WEATHERING_TICK_TO'
    },
    'minecraft:target_far_enough': {
        ticks: [0, 2],
        java: 'Guardian$GuardianAttackGoal, which stops within 3 blocks and starts again on the next goal update'
    },
    become_zombie_event: { ticks: [300, 300], java: 'AbstractPiglin.CONVERSION_TIME and Hoglin.CONVERSION_TIME' },
    'minecraft:convert_to_zombie': {
        ticks: [600, 600],
        java: "Zombie's drowning ConversionTracker (InWaterTime 600), which Husk inherits"
    },
    'minecraft:convert_to_drowned': {
        ticks: [600, 600],
        java: "Zombie's drowning ConversionTracker (InWaterTime 600)"
    },
    'minecraft:clear_add_raid_omen': {
        ticks: [0, 0],
        java: 'MobEffects.BAD_OMEN, which turns into the raid omen at once'
    },
    'minecraft:on_full_puff': {
        ticks: [0, 0],
        java: 'Pufferfish.tick, which shows a full puff the tick it reaches it'
    },
    'minecraft:on_half_puff': {
        ticks: [40, 40],
        java: 'Pufferfish.tick, half puff to full after inflateCounter passes 40'
    },
    'minecraft:on_normal_puff': {
        ticks: [40, 40],
        java: 'Pufferfish.tick, half puff to none from deflateTimer 60 to 100'
    },
    'minecraft:on_deflate': {
        ticks: [60, 60],
        java: 'Pufferfish.tick, full puff to half after deflateTimer passes 60'
    },
    'minecraft:start_roar': { ticks: [40, 40], java: 'Ravager.STUN_DURATION' },
    become_stray_event: { ticks: [140, 140], java: "Skeleton's freezing ConversionTracker (FreezingTime 140)" },
    'minecraft:on_pickup_timeout': { ticks: [100, 100], java: 'SulfurCube.PICKUP_TIMER_DURATION' },
    'minecraft:add_periodic_damage': {
        ticks: [600, 2380],
        java: 'Evoker$EvokerSummonSpellGoal, setLimitedLife(20 * (30 + nextInt(90)))'
    },
    'minecraft:start_despawn': { ticks: [48000, 48000], java: 'WanderingTraderSpawner.spawn, setDespawnDelay(48000)' }
};

/** The shortest and longest clock a timer body starts, drawn with the lowest and highest random value. */
const timerRange = (
    bedrock: string,
    body: TimerBody
): { readonly shortest: number | undefined; readonly longest: number | undefined } => {
    const clockWith = (value: number): number | undefined => {
        const probed = probe(bedrock, { random: fixedRandom(value) });
        activate(probed.entity, body.group);
        return clockOf(probed.entity, 'minecraft:timer');
    };
    return { shortest: clockWith(0), longest: clockWith(1 - Number.EPSILON) };
};

/** The Bedrock identifier a Java entity type runs as. */
const bedrockEntity = (javaId: string): string => mappedEntity(javaId)?.bedrock ?? javaId;

/** One Java conversion: what causes it, the type it makes, and how long Java takes. */
interface Conversion {
    /** The Java entity type the mob becomes. */
    readonly into: string;
    /** The Bedrock event the cause fires, such as the sensor that sees a zombie underwater. */
    readonly start: string;
    /** The facts that hold while the cause lasts, so the entity's own sensors keep it going. */
    readonly world?: ProbeWorld;
    /**
     * The fewest and most ticks from the cause until Java converts, counting the tick the cause
     * first holds as 1. A conversion Java makes in the tick of the cause (lightning, shears, a
     * kill) is 1: the Bedrock event the cause fires lands on the next tick boundary, where every
     * Bedrock event lands.
     */
    readonly ticks: readonly [number, number];
    readonly java: string;
}

const TO_ZOMBIFIED_PIGLIN = 'minecraft:zombified_piglin';

/** Java's piglin and hoglin zombification: `timeInOverworld` passing `CONVERSION_TIME` (300). */
const zombification = (into: string, java: string): Conversion => ({
    into,
    start: 'start_zombification_event',
    ticks: [301, 301],
    java
});

/** Every Java conversion of a mob that declares `minecraft:transformation`, by Java entity type. */
const CONVERSIONS: Readonly<Record<string, readonly Conversion[]>> = {
    'minecraft:zombie': [
        {
            into: 'minecraft:drowned',
            start: 'minecraft:start_transforming_into_drowned',
            world: { flags: { is_underwater: true, in_water: true } },
            ticks: [901, 901],
            java: 'the Zombie drowning ConversionTracker (600 ticks underwater, then 300)'
        }
    ],
    'minecraft:husk': [
        {
            into: 'minecraft:zombie',
            start: 'minecraft:start_transforming_into_zombie',
            world: { flags: { is_underwater: true, in_water: true } },
            ticks: [901, 901],
            java: 'Husk.getConversionType through the Zombie drowning ConversionTracker (600, then 300)'
        }
    ],
    'minecraft:skeleton': [
        {
            into: 'minecraft:stray',
            start: 'got_in_powder_snow',
            world: { names: { in_block: ['minecraft:powder_snow'] } },
            ticks: [441, 441],
            java: 'the Skeleton freezing ConversionTracker (140 ticks in powder snow, then 300)'
        }
    ],
    'minecraft:piglin': [zombification(TO_ZOMBIFIED_PIGLIN, 'AbstractPiglin.CONVERSION_TIME')],
    'minecraft:piglin_brute': [zombification(TO_ZOMBIFIED_PIGLIN, 'AbstractPiglin.CONVERSION_TIME')],
    'minecraft:hoglin': [zombification('minecraft:zoglin', 'Hoglin.CONVERSION_TIME')],
    'minecraft:pig': [
        {
            into: TO_ZOMBIFIED_PIGLIN,
            start: 'become_zombie',
            ticks: [1, 1],
            java: 'Pig.thunderHit, in the lightning tick'
        }
    ],
    'minecraft:villager': [
        {
            into: 'minecraft:witch',
            start: 'become_witch',
            ticks: [1, 1],
            java: 'Villager.thunderHit, in the lightning tick'
        },
        {
            into: 'minecraft:zombie_villager',
            start: 'become_zombie',
            world: { difficulty: 'hard' },
            ticks: [1, 1],
            java: 'Zombie.killedEntity on Hard, in the tick of the kill'
        }
    ],
    'minecraft:zombie_villager': [
        {
            into: 'minecraft:villager',
            start: 'villager_converted',
            ticks: [3601, 6001],
            java: 'ZombieVillager.startConverting (3600 to 6000 ticks with no bed or iron bars near)'
        }
    ],
    'minecraft:mooshroom': [
        { into: 'minecraft:cow', start: 'become_cow', ticks: [1, 1], java: 'MushroomCow.shear, in the shearing tick' }
    ],
    'minecraft:tadpole': [
        {
            into: 'minecraft:frog',
            start: 'ageable_grow_up',
            ticks: [1, 1],
            java: 'Tadpole.ageUp, in the tick it is old enough'
        }
    ]
};

/** Runs one conversion with the lowest and highest random draw: the ticks each took and what it asked to become. */
const runConversion = (
    bedrock: string,
    conversion: Conversion
): readonly { readonly ticks: number | undefined; readonly into: string | undefined }[] =>
    [0, 1 - Number.EPSILON].map((value) => {
        const probed = probe(bedrock, { ...conversion.world, random: fixedRandom(value) });
        probed.entity.fire(conversion.start);
        const ticks = ticksUntil(probed.entity, () => probed.transforms.length > 0, conversion.ticks[1] + 400);
        return { ticks, into: probed.transforms[0]?.identifier };
    });

/** One live entity of the shared runtime. */
type DataEntity = NonNullable<ReturnType<EntityRuntime['spawn']>>;

/** A stretch of the shared test world no other scenario uses, a fresh one per call. */
let nextSpot = 0;
const freshSpot = (): EntityPosition => {
    nextSpot += 1;
    return { x: 40_000 + nextSpot * 32 + 0.5, y: 64, z: 40_000.5 };
};

/** The runtime id of the player whose hand the breeding and spawn-egg scenarios feed with. */
const FEEDER = 990_001;

/**
 * Spawns one entity type in the shared runtime as an adult, failing loudly when the server has no
 * such type. A type whose spawn event made a baby, such as the strider, is spawned again through
 * its own adult spawn event when it declares one.
 */
const spawnLive = (bedrock: string, at: EntityPosition): DataEntity => {
    const { runtime } = realStack();
    const events = serverContent().entities.registry.get(bedrock)?.entity.events;
    const adult = ['minecraft:spawn_adult', 'spawn_adult'].find((event) => events?.has(event) === true);
    for (let attempt = 0; attempt < 32; attempt += 1) {
        const entity = runtime.spawn(bedrock, at, attempt === 0 || adult === undefined ? {} : { event: adult });
        if (entity === undefined) throw new Error(`the server spawns no ${bedrock}`);
        if (!entity.instance.hasComponent('minecraft:is_baby') || attempt === 31) return entity;
        runtime.remove(entity.id, 'parity lifecycle scenario wanted an adult');
    }
    throw new Error(`the server spawns no adult ${bedrock}`);
};

/** Removes what a scenario spawned, so later scenarios see an empty spot. */
const cleanUp = (entities: readonly DataEntity[]): void => {
    for (const entity of entities) realStack().runtime.remove(entity.id, 'parity lifecycle scenario complete');
};

/** Everything that appeared near a spot that is not one of the given entities. */
const newcomers = (at: EntityPosition, known: readonly DataEntity[]): readonly DataEntity[] => {
    const ids = new Set(known.map((entity) => entity.id));
    return realStack()
        .runtime.near(at, 4)
        .filter((entity) => !ids.has(entity.id));
};

/** Java's `Animal.setInLove`, which puts a fed animal in love for 600 ticks. */
const JAVA_LOVE_TICKS = 600;

/** Java's `Animal.finalizeSpawnChildFromBreeding`, which sets both parents' age to 6000 after they breed. */
const JAVA_BREED_COOLDOWN = 6000;

/**
 * The items that put each Java animal in love where its food tag does not say: horses and donkeys
 * only for golden food (`AbstractHorse.handleEating`), llamas only for a hay bale
 * (`Llama.handleEating`), and a mooshroom for the cow's food.
 */
const LOVE_FOOD: Readonly<Record<string, readonly string[]>> = {
    'minecraft:horse': ['minecraft:golden_carrot', 'minecraft:golden_apple', 'minecraft:enchanted_golden_apple'],
    'minecraft:donkey': ['minecraft:golden_carrot', 'minecraft:golden_apple', 'minecraft:enchanted_golden_apple'],
    'minecraft:llama': ['minecraft:hay_block'],
    'minecraft:trader_llama': ['minecraft:hay_block']
};

/** The Bedrock items that put a Java animal in love. */
const javaLoveFood = (javaId: string): readonly string[] => {
    const listed = LOVE_FOOD[javaId];
    if (listed !== undefined) return listed.map(bedrockItem);
    const tag = javaId === 'minecraft:mooshroom' ? 'minecraft:cow_food' : `${javaId}_food`;
    return javaTagItems(tag);
};

/** The items a server type's `minecraft:breedable` accepts, as the server compares them. */
const serverLoveFood = (bedrock: string): readonly string[] =>
    loadedComponentValues(bedrock, 'minecraft:breedable').flatMap((value) => {
        const items = field(value, 'breed_items');
        const list = Array.isArray(items) ? items : items === undefined ? [] : [items];
        return list.flatMap((item: unknown) => {
            const identifier = typeof item === 'string' ? item : field(item, 'item');
            return typeof identifier === 'string' ? [withNamespace(identifier)] : [];
        });
    });

/**
 * The animals Java breeds into something other than a baby of their own kind: a turtle lays
 * eggs, a frog lays frogspawn and a sniffer drops an egg, each from `spawnChildFromBreeding`.
 */
const LAYS_INSTEAD: ReadonlySet<string> = new Set(['minecraft:turtle', 'minecraft:frog', 'minecraft:sniffer']);

/** The first component group of a server type that declares a component, when its base components do not. */
const groupDeclaring = (bedrock: string, component: string): string | undefined => {
    const type = serverContent().entities.registry.get(bedrock);
    if (type === undefined || type.entity.components.has(component)) return undefined;
    for (const [group, components] of type.entity.componentGroups) if (components.has(component)) return group;
    return undefined;
};

/** The component groups of a server type that declare a component, with undefined first when its base components do. */
const groupsDeclaring = (bedrock: string, component: string): readonly (string | undefined)[] => {
    const type = serverContent().entities.registry.get(bedrock);
    if (type === undefined) return [];
    const groups = [...type.entity.componentGroups].flatMap(([group, components]) =>
        components.has(component) ? [group] : []
    );
    return type.entity.components.has(component) ? [undefined, ...groups] : groups;
};

/**
 * Every body of one component a server type runs, in its base components and each group, as the
 * server loaded them: after the Java overlays the content build writes over the pack's files.
 */
const loadedComponentValues = (bedrock: string, component: string): readonly unknown[] => {
    const type = serverContent().entities.registry.get(bedrock);
    if (type === undefined) return [];
    const base = type.entity.components.get(component);
    const grouped = [...type.entity.componentGroups.values()].flatMap((components) => {
        const body = components.get(component);
        return body === undefined ? [] : [body];
    });
    return base === undefined ? grouped : [base, ...grouped];
};

/** Java mobs whose own spawn egg makes nothing when used on them: `Frog.canBeABaby` is false, so the egg's baby is refused. */
const NO_EGG_OFFSPRING: ReadonlySet<string> = new Set(['minecraft:frog']);

/** What one breeding in the shared runtime did. */
interface Breeding {
    /** The love ticks feeding gave the first parent. */
    readonly loveTicks: number;
    /** Whether the type decides love with a filter on its own state rather than a feeding clock. */
    readonly loveByFilter: boolean;
    readonly child: string | undefined;
    readonly childIsBaby: boolean;
    /** Each parent's wait before it may breed again. */
    readonly cooldowns: readonly number[];
}

/**
 * Feeds two adults in the shared runtime, taming them first when their type requires it, puts
 * them in love, and breeds them through the runtime's own breeding.
 *
 * @returns What happened, or why the pair would not breed.
 */
const breed = (mother: string, father: string, food: string | undefined): Breeding | string => {
    const { runtime } = realStack();
    const at = freshSpot();
    const parents = [spawnLive(mother, at), spawnLive(father, { ...at, x: at.x + 1 })];
    try {
        // A horse breeds once tamed and an ocelot once it trusts: the group that carries the
        // component is what Java's tame or trust check stands for. A mob that comes to trust runs
        // its own trust event, which also takes off the wild group that would eat the food for trust.
        for (const parent of parents) {
            if (parent.instance.hasComponent('minecraft:breedable')) continue;
            const trust = field(field(parent.instance.componentParams('minecraft:trusting'), 'trustEvent'), 'event');
            if (typeof trust === 'string') {
                parent.instance.fire(trust);
                parent.instance.applyQueuedEvents();
            } else activate(parent.instance, groupDeclaring(parent.identifier, 'minecraft:breedable'));
        }
        const params = parents[0]?.instance.componentParams('minecraft:breedable');
        if (params === undefined) return 'an adult has no minecraft:breedable to activate';
        for (const parent of parents) {
            if (field(params, 'require_tame') !== false) runtime.setOwner(parent.id, FEEDER);
            if (food !== undefined) runtime.interactWithItem(parent.id, FEEDER, food);
        }
        const loveTicks = parents[0]?.body.loveTicks ?? 0;
        // A type whose love is a filter on its own state is willing whenever the filter holds.
        for (const parent of parents) runtime.setInLove(parent.id, JAVA_LOVE_TICKS);
        const [first, second] = parents;
        const mate = second === undefined ? undefined : runtime.mobById(second.id);
        if (first === undefined || mate === undefined || !runtime.canBreedWith(first.body, mate))
            return 'two fed adults in love will not breed';
        runtime.breedWith(first.body, mate);
        const children = newcomers(at, parents);
        const child = children[0];
        const outcome = {
            loveTicks,
            loveByFilter: field(params, 'love_filters') !== undefined,
            child: child?.identifier,
            childIsBaby: child?.instance.hasComponent('minecraft:is_baby') === true,
            cooldowns: parents.map((parent) => parent.body.breedCooldown)
        };
        cleanUp(children);
        return outcome;
    } finally {
        cleanUp(parents);
    }
};

/** What Java creates where a Bedrock `minecraft:spawn_entity` creates something, and after how long. */
interface JavaSpawn {
    readonly ticks: readonly [number, number];
    readonly kind: 'item' | 'entity';
    readonly identifier: string;
    readonly count: number;
    readonly leashed?: boolean;
    readonly java: string;
}

/** The item Java's `gameplay/chicken_lay` table gives a chicken of one climate variant. */
const chickenLay = (variant: string): string | undefined => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'loot_table', 'gameplay', 'chicken_lay.json');
    // Parsed JSON boundary; only the alternatives' names and variant predicates are read.
    const table: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const pools = field(table, 'pools');
    const entries = Array.isArray(pools) ? field(pools[0], 'entries') : undefined;
    const children = Array.isArray(entries) ? field(entries[0], 'children') : undefined;
    if (!Array.isArray(children)) return undefined;
    const match = children.find(
        (child: unknown) =>
            field(
                field(field(field(child, 'condition'), 'predicate'), 'minecraft:components'),
                'minecraft:chicken/variant'
            ) === withNamespace(variant)
    );
    const name = field(match, 'name');
    return typeof name === 'string' ? bedrockItem(name) : undefined;
};

/** The one item a Java gift loot table such as `gameplay/armadillo_shed` gives. */
const giftItem = (table: string): string | undefined => {
    const [stack] = serverContent().loot.roll(table);
    return stack === undefined ? undefined : bedrockItem(stack.id);
};

/** Java's counterpart of each `minecraft:spawn_entity`, by Java entity type and the entity's climate variant. */
const javaSpawnOf = (javaId: string, variant: string | undefined): JavaSpawn | undefined => {
    switch (javaId) {
        case 'minecraft:chicken':
            return {
                ticks: [6000, 11999],
                kind: 'item',
                identifier: chickenLay(variant ?? 'temperate') ?? 'minecraft:egg',
                count: 1,
                java: 'Chicken.eggTime (random.nextInt(6000) + 6000) and gameplay/chicken_lay'
            };
        case 'minecraft:armadillo':
            return {
                ticks: [6000, 11999],
                kind: 'item',
                identifier: giftItem('minecraft:gameplay/armadillo_shed') ?? 'minecraft:armadillo_scute',
                count: 1,
                java: 'Armadillo.pickNextScuteDropTime (random.nextInt(6000) + 6000) and gameplay/armadillo_shed'
            };
        case 'minecraft:copper_golem':
            return {
                ticks: [0, 0],
                kind: 'item',
                identifier: 'minecraft:poppy',
                count: 1,
                java: 'CopperGolem.shear, which drops the flower it wears'
            };
        case 'minecraft:drowned':
            return {
                ticks: [0, 0],
                kind: 'entity',
                identifier: 'minecraft:zombie_nautilus',
                count: 1,
                java: 'Drowned.finalizeSpawn, a zombie nautilus jockey'
            };
        case 'minecraft:sniffer':
            return {
                ticks: [0, 0],
                kind: 'item',
                identifier: 'minecraft:sniffer_egg',
                count: 1,
                java: 'Sniffer.spawnChildFromBreeding, one SNIFFER_EGG'
            };
        case 'minecraft:wandering_trader':
            return {
                ticks: [0, 0],
                kind: 'entity',
                identifier: 'minecraft:trader_llama',
                count: 2,
                leashed: true,
                java: 'WanderingTraderSpawner.spawn, tryToSpawnLlamaFor twice with the llama leashed'
            };
        default:
            return undefined;
    }
};

/** The countdowns a `minecraft:spawn_entity` keeps, one per entry. */
const spawnClocks = (entity: EntityInstance): readonly number[] => {
    const remaining = field(entity.componentState.snapshot()['minecraft:spawn_entity'], 'remaining');
    return Array.isArray(remaining) ? remaining.filter((value): value is number => typeof value === 'number') : [];
};

/** A probe of a type with its `minecraft:spawn_entity` group active and the facts its entries' filters need. */
const spawnProbe = (bedrock: string, random: number): Probe => {
    const probed = probe(bedrock, { random: fixedRandom(random), measures: { rider_count: 0 } });
    activate(probed.entity, groupDeclaring(bedrock, 'minecraft:spawn_entity'));
    if (probed.entity.properties.has('minecraft:has_flower'))
        probed.entity.properties.set('minecraft:has_flower', true);
    return probed;
};

/** One Java distance rule a `minecraft:target_nearby_sensor` event stands for. */
interface RangeRule {
    readonly event: string;
    /** Whether Java takes the action at this distance from the target. */
    readonly holds: (distance: number) => boolean;
}

/** Java's start and stop distances for each mob whose server definition senses its target's range. */
const TARGET_RANGES: Readonly<
    Record<string, { readonly start?: RangeRule; readonly stop?: RangeRule; readonly java: string }>
> = {
    'minecraft:creeper': {
        start: { event: 'minecraft:start_exploding', holds: (distance) => distance < 3 },
        stop: { event: 'minecraft:stop_exploding', holds: (distance) => distance > 7 },
        java: 'SwellGoal: swells once distanceToSqr < 9 and stops past distanceToSqr > 49'
    },
    'minecraft:blaze': {
        start: { event: 'switch_to_melee', holds: (distance) => distance < 2 },
        stop: { event: 'switch_to_ranged', holds: (distance) => distance >= 2 },
        java: 'Blaze$BlazeAttackGoal.tick: melee below distanceToSqr 4, fireballs beyond'
    },
    'minecraft:guardian': {
        start: { event: 'minecraft:target_too_close', holds: (distance) => distance <= 3 },
        java: 'Guardian$GuardianAttackGoal.canContinueToUse: stops at distanceToSqr 9 or nearer'
    },
    'minecraft:drowned': {
        start: { event: 'minecraft:switch_to_melee', holds: () => false },
        java: "Drowned's goal setup: DrownedTridentAttackGoal comes first at priority 2, so a trident drowned throws at any range"
    }
};

/** The distances a sweep visits, in quarter blocks. */
const SWEEP = Array.from({ length: 41 }, (_, step) => step / 4);

/** The first distance of a sweep at which an event is raised, with a probed entity's target moved along it. */
const firstRaised = (
    bedrock: string,
    event: string,
    distances: readonly number[],
    settle: number
): number | undefined => {
    let distance = distances[0] ?? 0;
    const probed = probe(bedrock, { target: () => ({ id: 1, distance, visible: true }) });
    // A drowned senses its target only while it holds a trident, in the group that carries the sensor.
    activate(probed.entity, groupDeclaring(bedrock, 'minecraft:target_nearby_sensor'));
    for (let tick = 0; tick < settle; tick += 1) probed.entity.tick(false);
    for (const next of distances) {
        distance = next;
        probed.entity.tick(false);
        if (raised(probed.entity, event)) return next;
    }
    return undefined;
};

/** Java's search box for each mob whose server definition runs a `minecraft:entity_sensor`. */
const SENSOR_REACH: Readonly<
    Record<
        string,
        {
            readonly horizontal?: number;
            readonly vertical: number;
            /** How far above its feet the search is centered, where Java's box is not centered on the mob. */
            readonly yOffset?: number;
            readonly java: string;
        }
    >
> = {
    'minecraft:armadillo': {
        horizontal: 7,
        vertical: 2,
        java: 'Armadillo, which looks for threats in its box inflated by 7, 2, 7'
    },
    'minecraft:pufferfish': {
        horizontal: 2,
        vertical: 2,
        java: 'Pufferfish$PufferfishPuffGoal, its box inflated by 2'
    },
    'minecraft:happy_ghast': {
        horizontal: 3,
        vertical: 1,
        yOffset: 5,
        java: 'HappyGhast.scanPlayerAboveGhast, its 4 block box inflated by 1 sideways and spanning its top to half its height above, 4 to 6 blocks up'
    }
};

/** The Java blocks a block-break sensor guards, and how far from the break Java reaches. */
const BLOCK_GUARDS: Readonly<Record<string, { readonly tag: string; readonly radius: number; readonly java: string }>> =
    {
        'minecraft:bee': {
            tag: 'minecraft:beehives',
            radius: 8,
            java: 'BeehiveBlock.angerNearbyBees, which angers the bees in the hive box inflated by 8, 6, 8'
        },
        'minecraft:piglin': {
            tag: 'minecraft:guarded_by_piglins',
            radius: 16,
            java: 'PiglinAi.angerNearbyPiglins, which angers the piglins within 16 blocks (PLAYER_ANGER_RANGE)'
        }
    };

/** The Bedrock blocks of a Java block tag, as the server names them. */
const javaTagBlocks = (tag: string): ReadonlySet<string> =>
    new Set(
        serverContent()
            .tags.members('block', tag)
            .flatMap((block) => {
                const mapped = javaBlockStateToBedrock(block);
                return mapped.kind === 'unknown' ? [] : [mapped.bedrock.name];
            })
    );

/** A Java constant from the pinned server jar. */
const javaConstant = (className: string, name: string): number | undefined =>
    pinnedJavaConstants(`net/minecraft/world/entity/${className}`).get(name);

/** A player standing beside a mob and holding one item, as an interaction filter reads it. */
const playerHolding = (item: string) => ({
    id: () => FEEDER,
    names: (name: string) => (name === 'is_family' ? ['player'] : undefined),
    equipment: (slot: string) => (slot === 'hand' ? { identifier: () => item } : undefined)
});

/** The Bedrock items a Java gift loot table can give, from its entries. */
const javaLootItems = (table: string): ReadonlySet<string> => {
    const path = join(
        unpackVanillaDatapack(),
        'data',
        'minecraft',
        'loot_table',
        `${table.replace('minecraft:', '')}.json`
    );
    // Parsed JSON boundary; only the entries' names are read.
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const pools = field(data, 'pools');
    const names = (Array.isArray(pools) ? pools : []).flatMap((pool: unknown) => {
        const entries = field(pool, 'entries');
        return (Array.isArray(entries) ? entries : []).flatMap((entry: unknown) => {
            const name = field(entry, 'name');
            return typeof name === 'string' ? [bedrockItem(name)] : [];
        });
    });
    return new Set(names);
};

/**
 * The home radius Java holds each mob's random movement to, from every `Mob.setHomeTo` call in
 * the pinned jar. A mob not listed has no home radius in Java: a guardian, a creaking, a turtle or
 * a piglin brute never calls it, and a bee steers its wander back toward its hive past 24 or 32
 * blocks (`Bee$BeeWanderGoal.getWanderThreshold`) rather than being held to a radius.
 */
const HOME_RADII: Readonly<Record<string, { readonly radii: readonly number[]; readonly java: string }>> = {
    'minecraft:happy_ghast': {
        radii: [32, 64],
        java: 'HappyGhast.checkRestriction, SMALL_RESTRICTION_RADIUS and LARGE_RESTRICTION_RADIUS'
    },
    'minecraft:nautilus': {
        radii: [16, 32],
        java: 'AbstractNautilus.checkRestriction, SMALL_RESTRICTION_RADIUS and LARGE_RESTRICTION_RADIUS'
    },
    'minecraft:zombie_nautilus': {
        radii: [16, 32],
        java: 'AbstractNautilus.checkRestriction, SMALL_RESTRICTION_RADIUS and LARGE_RESTRICTION_RADIUS'
    },
    'minecraft:elder_guardian': {
        radii: [16],
        java: 'ElderGuardian.customServerAiStep, setHomeTo(blockPosition(), 16)'
    },
    'minecraft:wandering_trader': { radii: [16], java: 'WanderingTraderSpawner.spawn, setHomeTo(target, 16)' }
};

/** The range a probed wander draws its destination in, Java's `RandomStrollGoal` default of 10 blocks. */
const WANDER_RANGE = 10;

/**
 * Whether the server's random stroll, on an entity whose only other component is one of the
 * mob's `minecraft:home` bodies, walks to a destination `away` blocks from home while the entity
 * stands `standing` blocks from it.
 */
const wandersTo = (home: unknown, standing: number, away: number): boolean => {
    const probed = probeGoal(
        'minecraft:behavior.random_stroll',
        { priority: 1, interval: 1, xz_dist: WANDER_RANGE, y_dist: 7 },
        {
            at: { x: 0.5, y: 64, z: 0.5 },
            wander: { x: away + 0.5, y: 64, z: 0.5 },
            components: { 'minecraft:home': home }
        }
    );
    probed.actuator.at = { x: standing + 0.5, y: 64, z: 0.5 };
    gameTicks(probed, 1);
    return walkSpeeds(probed).length > 0;
};

/**
 * Java's `Bee$BeeWanderGoal`: whether the bee's hover wander heads toward its hive, on every draw,
 * when the bee stands `standing` blocks from it. `findPos` aims within 90 degrees of the hive once
 * the bee is `getWanderThreshold` blocks from it, and along its own facing otherwise.
 *
 * @returns How many of the first steps of 30 wanders head away from home, of how many it drew.
 */
const hoverStepsAway = (body: unknown, standing: number): { readonly away: number; readonly drawn: number } => {
    const size = standing + 16;
    const floor = Array.from({ length: size }, () => '#'.repeat(size));
    const air = Array.from({ length: size }, () => '.'.repeat(size));
    const view = voxelGrid([floor, air, air, air, air, air, air]);
    let away = 0;
    let drawn = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
        let state = seed;
        const probed = probeGoal('minecraft:behavior.random_hover', body, {
            at: { x: 2.5, y: 2, z: 8.5 },
            components: { 'minecraft:navigation.hover': {}, 'minecraft:can_fly': {} },
            world: { navigation: () => view },
            // Park and Miller's generator, so each seed draws its own wander.
            random: () => {
                state = (state * 16807) % 2147483647;
                return state / 2147483647;
            }
        });
        probed.entity.setHomePosition({ x: 2.5, y: 2, z: 8.5 });
        probed.actuator.at = { x: standing + 2.5, y: 2, z: 8.5 };
        // The hover goal starts on one selector tick in its interval, and the probe's actuator
        // jumps to each waypoint, so the wander ends where the goal stops running.
        let started = false;
        for (let tick = 0; tick < 200; tick += 1) {
            gameTicks(probed, 1);
            const running = probed.isRunning('minecraft:behavior.random_hover');
            if (started && !running) break;
            started ||= running;
        }
        if (!started) continue;
        drawn += 1;
        // Within the walk's one-block goal radius of a spot square to home counts as heading back.
        if (probed.actuator.at.x > standing + 2.5 + 1) away += 1;
    }
    return { away, drawn };
};

/**
 * The mobs whose Java class moves their home to where they are once they stray far from it, with
 * the class whose `checkRestriction` does it and whether it only does so for a tamed mob.
 */
const REHOMING: Readonly<Record<string, { readonly javaClass: string; readonly tamedOnly: boolean }>> = {
    'minecraft:happy_ghast': { javaClass: 'net/minecraft/world/entity/animal/happyghast/HappyGhast', tamedOnly: false },
    'minecraft:nautilus': { javaClass: 'net/minecraft/world/entity/animal/nautilus/AbstractNautilus', tamedOnly: true },
    'minecraft:zombie_nautilus': {
        javaClass: 'net/minecraft/world/entity/animal/nautilus/AbstractNautilus',
        tamedOnly: true
    }
};

/**
 * Java's `checkRestriction`: a mob more than its restriction radius plus the margin the method
 * adds from home, not leashed and carrying no rider, and tamed for the nautilus, takes the block
 * it is in as its new home. Moves a live mob that far and reports what the server did.
 */
const rehomingDifferences = (subject: EntitySubject): readonly string[] => {
    const rule = REHOMING[subject.javaId];
    if (rule === undefined) return [];
    const [margin] = javaMethodNumbers(rule.javaClass, 'checkRestriction');
    if (margin === undefined) return ["Java's checkRestriction margin could not be read"];
    const { runtime } = realStack();
    const differences: string[] = [];
    const at = freshSpot();
    const mob = spawnLive(subject.bedrock, at);
    try {
        const strayTo = (distance: number): boolean => {
            const home = mob.instance.homePosition;
            mob.position = { ...mob.position, x: (home?.x ?? at.x) + distance };
            runtime.tick(1);
            runtime.tick(2);
            const moved = mob.instance.homePosition;
            return moved !== undefined && Math.abs(moved.x - mob.position.x) < 2;
        };
        if (rule.tamedOnly) {
            if (strayTo(64)) differences.push("an untamed one moves its home, where Java's only moves a tamed one's");
            // Tamed the way a player's food tames it: its own tame event, which brings its home radius.
            const tame = field(field(mob.instance.componentParams('minecraft:tameable'), 'tameEvent'), 'event');
            if (typeof tame !== 'string') return [...differences, 'it has no tame event to tame it by'];
            runtime.setOwner(mob.id, FEEDER);
            mob.instance.fire(tame);
            mob.instance.applyQueuedEvents();
        }
        const radius = field(mob.instance.componentParams('minecraft:home'), 'restriction_radius');
        if (typeof radius !== 'number') return [...differences, 'it has no home radius to stray past'];
        if (strayTo(radius + margin - 2))
            differences.push(`it moves its home when it is ${radius + margin - 2} blocks off`);
        if (!strayTo(radius + margin + 2))
            differences.push(
                `its home stays where it was ${radius + margin + 2} blocks off, where Java moves it to the mob past ${radius} plus ${margin}`
            );
        const rider = spawnLive('minecraft:zombie', mob.position);
        try {
            const seat = runtime.mobById(mob.id);
            if (seat !== undefined) runtime.mount(rider.body, seat);
            // A rider the mob throws off on its next tick leaves it unridden, which Java re-homes too.
            if (strayTo(radius + margin + 2) && runtime.ridersOf(mob.body).length > 0)
                differences.push("a ridden one moves its home, where Java's leaves it while ridden");
        } finally {
            cleanUp([rider]);
        }
    } finally {
        cleanUp([mob]);
    }
    return differences;
};

/** The mobs Java gives a home position when they spawn: `Turtle.finalizeSpawn`, `PiglinBruteAi.initMemories`, `WanderingTraderSpawner`. */
const HOME_AT_SPAWN: ReadonlySet<string> = new Set([
    'minecraft:turtle',
    'minecraft:piglin_brute',
    'minecraft:wandering_trader'
]);

/** The Java mobs that school: every subclass of `AbstractSchoolingFish`. */
const JAVA_SCHOOLING: ReadonlySet<string> = new Set(['minecraft:cod', 'minecraft:salmon', 'minecraft:tropical_fish']);

/**
 * Java's largest school for a fish type: its class's own `getMaxSchoolSize`, or else what
 * `AbstractSchoolingFish.getMaxSchoolSize` returns, the `getMaxSpawnClusterSize` of the class
 * above it.
 */
const javaMaxSchoolSize = (javaId: string): number | undefined => {
    const className = javaEntityClassName(javaId);
    const own = javaMethodOf(className, 'getMaxSchoolSize');
    const pushed = own === undefined ? [] : pushedNumbers(own.method);
    if (pushed.length > 0) return pushed[0];
    const chain = javaClassChain(className);
    const schooling = chain.findIndex((entry) => entry.name.endsWith('/AbstractSchoolingFish'));
    const above = chain[schooling + 1]?.methods.find((method) => method.name === 'getMaxSpawnClusterSize');
    return above === undefined ? undefined : pushedNumbers(above)[0];
};

/** Whether the server runs a component at all: a factory with a hook, rather than data kept for others to read. */
const runs = (component: string): boolean => serverContent().entities.components.hooksOf(component).size > 0;

/** The names of a brain schedule's keyframes, in order, as `ticks:activity`. */
const keyframesOf = (schedule: {
    readonly keyframes: readonly (readonly [number, { readonly name: string }])[];
}): string => schedule.keyframes.map(([ticks, activity]) => `${ticks}:${activity.name}`).join(', ');

/** The keyframes of one track of Java's `timeline/villager_schedule.json`. */
const javaScheduleTrack = (track: string): string => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'timeline', 'villager_schedule.json');
    // Parsed JSON boundary; only the keyframes are read.
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const keyframes = field(field(field(data, 'tracks'), track), 'keyframes');
    return (Array.isArray(keyframes) ? keyframes : [])
        .map(
            (frame: unknown) =>
                `${String(field(frame, 'ticks'))}:${String(field(frame, 'value')).replace('minecraft:', '')}`
        )
        .join(', ');
};

/** The Bedrock trade file of each Java profession. */
const TRADE_FILES: Readonly<Record<string, string>> = {
    armorer: 'armorer',
    butcher: 'butcher',
    cartographer: 'cartographer',
    cleric: 'cleric',
    farmer: 'farmer',
    fisherman: 'fisherman',
    fletcher: 'fletcher',
    leatherworker: 'leather_worker',
    librarian: 'librarian',
    mason: 'stone_mason',
    shepherd: 'shepherd',
    toolsmith: 'tool_smith',
    weaponsmith: 'weapon_smith'
};

/** The Java villager trades one `trade_set` names, through its tag of `villager_trade` entries. */
const javaTradeGives = (tradeSet: string): ReadonlySet<string> => {
    const root = join(unpackVanillaDatapack(), 'data', 'minecraft');
    const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf-8'));
    const resolve = (reference: string): readonly string[] => {
        if (!reference.startsWith('#')) return [reference];
        const values = field(
            read(`tags/villager_trade/${reference.slice(1).replace('minecraft:', '')}.json`),
            'values'
        );
        return (Array.isArray(values) ? values : []).flatMap((value: unknown) =>
            typeof value === 'string' ? resolve(value) : []
        );
    };
    // Parsed JSON boundary; only the trade references and the given item ids are read.
    const trades = field(read(`trade_set/${tradeSet}.json`), 'trades');
    const gives = (typeof trades === 'string' ? resolve(trades) : []).flatMap((trade) => {
        const id = field(field(read(`villager_trade/${trade.replace('minecraft:', '')}.json`), 'gives'), 'id');
        return typeof id === 'string' ? [bedrockItem(id)] : [];
    });
    return new Set(gives);
};

/**
 * The item a Bedrock trade item stands for: Bedrock writes an enchanted book as a book with
 * `enchant_book_for_trading`, an explorer map as a map with `exploration_map`, and two items by
 * their legacy aux value.
 */
const tradedItem = (item: string, functions: readonly string[]): string => {
    const [name = item, aux] = item.replace(/^minecraft:/, '').split(':');
    const bare = withNamespace(name);
    if (bare === 'minecraft:book' && functions.includes('enchant_book_for_trading')) return 'minecraft:enchanted_book';
    if (bare === 'minecraft:map' && functions.includes('exploration_map')) return 'minecraft:filled_map';
    if (bare === 'minecraft:dye' && aux === '4') return 'minecraft:lapis_lazuli';
    if (bare === 'minecraft:bucket' && aux === '2') return 'minecraft:cod_bucket';
    return bare;
};

/** The items one tier of a Bedrock economy trade table gives, from the table the server parsed. */
const bedrockTradeGives = (file: string, tier: number): ReadonlySet<string> => {
    const table = serverContent().tradeTables.get(`trading/economy_trades/${file}_trades.json`);
    const trades = table?.tiers[tier]?.groups.flatMap((group) => group.trades) ?? [];
    return new Set(
        trades.flatMap((trade) =>
            trade.gives.flatMap((slot) =>
                slot.choices.map((choice) =>
                    tradedItem(
                        choice.item,
                        choice.functions.map((fn) => fn.name)
                    )
                )
            )
        )
    );
};

/** A raid host with one player standing in a village, carrying Bad Omen until the manager spends it. */
const omenHost = () => {
    let omen = 1;
    const player = {
        id: FEEDER,
        position: { x: 0, y: 64, z: 0 },
        get badOmenLevel() {
            return omen;
        },
        clearBadOmen: () => {
            omen = 0;
        },
        grantHero: () => undefined
    };
    return {
        difficulty: () => 2,
        random: () => 0.5,
        players: () => [player],
        villageCenterAt: () => ({ x: 0, y: 64, z: 0 }),
        isVillage: () => true,
        surfaceAt: () => undefined,
        spawnRaider: () => undefined,
        raiderAlive: () => false
    };
};

/** The growth, breeding and lifecycle scenarios, one row per Java entity that declares the aspect. */
export const lifecycleScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'grows-up',
        java: "A newborn grows up after Java's baby age (24000 ticks, 48000 for a sniffer), and a turtle drops the gameplay/turtle_grow loot when it does.",
        reference:
            'Java AgeableMob.BABY_START_AGE, Sniffer.getBabyStartAge (SNIFFER_BABY_START_AGE), Tadpole.ticksToBeFrog, Turtle.ageBoundaryReached and the gameplay/turtle_grow loot table',
        subjects: () => entitiesDeclaring('minecraft:ageable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:ageable'],
        run: (subject) => {
            const born = newborn(subject.bedrock);
            const clock = clockOf(born.entity, 'minecraft:ageable');
            const java = subject.javaId === 'minecraft:sniffer' ? SNIFFER_BABY_START_AGE : BABY_START_AGE;
            if (clock === undefined) return 'a newborn has no growth clock running';
            const differences: string[] = [];
            if (clock !== java) differences.push(`a newborn grows up after ${clock} ticks, where Java takes ${java}`);

            // Run the last ticks of the clock: the baby has to stop being a baby once it runs out.
            born.entity.componentState.write('minecraft:ageable', { remaining: 3, paused: false });
            const grown =
                subject.javaId === 'minecraft:tadpole'
                    ? () => born.transforms.length > 0
                    : () => !born.entity.hasComponent('minecraft:is_baby');
            if (ticksUntil(born.entity, grown, 10) === undefined)
                differences.push('the baby is still a baby after its growth clock ran out');

            const dropped = born.spawns.flatMap((request) => (request.kind === 'item' ? [request.identifier] : []));
            const javaDrops =
                subject.javaId === 'minecraft:turtle'
                    ? serverContent()
                          .loot.roll('minecraft:gameplay/turtle_grow')
                          .map((stack) => bedrockItem(stack.id))
                    : [];
            if (dropped.join() !== javaDrops.join())
                differences.push(
                    `growing up drops ${dropped.join(', ') || 'nothing'}, where Java drops ${javaDrops.join(', ') || 'nothing'}`
                );
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'baby-feeding',
        java: "Feeding a baby the items Java's mob eats speeds its growth by Java's amount: a tenth of the time left for most animals, a fixed number of seconds per item for horses, llamas and camels.",
        reference:
            'Java Animal.mobInteract and AgeableMob.getSpeedUpSecondsWhenFeeding, AbstractHorse.handleEating, Llama.handleEating, Camel.handleEating, Dolphin.mobInteract, Panda.mobInteract, Tadpole.feed, and the *_food item tags; issue #3152',
        subjects: () => entitiesDeclaring('minecraft:ageable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:ageable'],
        run: (subject) => {
            const rule = feedingRuleOf(subject.javaId);
            const javaItems = new Set(rule?.items ?? []);
            const serverItems = new Set(serverFeedItems(newborn(subject.bedrock).entity));
            const differences: string[] = [];
            const extra = [...serverItems].filter((item) => !javaItems.has(item));
            if (extra.length > 0)
                differences.push(`a baby grows by eating ${extra.join(', ')}, which Java's does not eat`);

            // Feed each Java item at two points of the clock, so a fixed and a proportional rule tell apart.
            for (const item of [...javaItems].sort()) {
                const outcomes = [BABY_START_AGE, 6000].map((ticksLeft) => {
                    const baby = newborn(subject.bedrock);
                    baby.entity.componentState.write('minecraft:ageable', { remaining: ticksLeft, paused: false });
                    const accepted = baby.entity.interactWithItem(item);
                    const left = clockOf(baby.entity, 'minecraft:ageable') ?? 0;
                    const java = Math.max(0, ticksLeft - (rule?.seconds(item, ticksLeft) ?? 0) * 20);
                    return { ticksLeft, accepted, left, java };
                });
                if (outcomes.some((outcome) => !outcome.accepted)) {
                    differences.push(`a baby does not eat ${item}`);
                    continue;
                }
                const wrong = outcomes.filter((outcome) => outcome.left !== outcome.java);
                if (wrong.length > 0)
                    differences.push(
                        wrong
                            .map(
                                (outcome) =>
                                    `${item} at ${outcome.ticksLeft} ticks left leaves ${outcome.left}, where Java leaves ${outcome.java}`
                            )
                            .join('; ')
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'timer-durations',
        java: "Each Bedrock timer stands in for a Java countdown and runs as long as Java's, from its shortest draw to its longest.",
        reference:
            'Java AbstractBoat.BUBBLE_TIME, AllayAi.ITEM_PICKUP_COOLDOWN_DURATION, Armadillo.SCARE_CHECK_INTERVAL, the Bee and BeehiveBlockEntity constants, CopperGolem.WEATHERING_TICK_FROM and _TO, Guardian$GuardianAttackGoal, AbstractPiglin and Hoglin CONVERSION_TIME, the Zombie and Skeleton ConversionTrackers, Pufferfish.tick, Ravager.STUN_DURATION, SulfurCube.PICKUP_TIMER_DURATION, Evoker$EvokerSummonSpellGoal and WanderingTraderSpawner.spawn; issue #3157',
        subjects: () => entitiesDeclaring('minecraft:timer'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:timer'],
        run: (subject) => {
            const differences: string[] = [];
            for (const body of timerBodies(subject.bedrock)) {
                const where = body.group ?? 'components';
                if (body.event === undefined) {
                    differences.push(`the ${where} timer fires no event`);
                    continue;
                }
                const java = JAVA_TIMERS[body.event];
                if (java === undefined) {
                    differences.push(`the ${where} timer fires ${body.event}, which no Java countdown is known for`);
                    continue;
                }
                const { shortest, longest } = timerRange(subject.bedrock, body);
                if (shortest !== java.ticks[0] || longest !== java.ticks[1])
                    differences.push(
                        `the ${body.event} timer runs ${String(shortest)} to ${String(longest)} ticks, where ${java.java} gives ${java.ticks[0]} to ${java.ticks[1]}`
                    );

                // The clock running out has to raise the event.
                const probed = probe(subject.bedrock);
                activate(probed.entity, body.group);
                probed.entity.componentState.write('minecraft:timer', { remaining: 1 });
                probed.entity.tick(false);
                if (!raised(probed.entity, body.event)) differences.push(`the ${body.event} timer never fires`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'conversions',
        java: "A mob converts into Java's type on each cause Java converts it on, after as many ticks as Java takes, and a mob Java never converts stays what it is.",
        reference:
            'Java ConversionTracker (Zombie, Husk, Skeleton), AbstractPiglin and Hoglin CONVERSION_TIME, Pig.thunderHit, Villager.thunderHit, Zombie.killedEntity, ZombieVillager.startConverting, MushroomCow.shear and Tadpole.ageUp; issue #3157',
        subjects: () => entitiesDeclaring('minecraft:transformation'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            timerBodies(subject.bedrock).length > 0
                ? ['minecraft:transformation', 'minecraft:timer']
                : ['minecraft:transformation'],
        run: (subject) => {
            const conversions = CONVERSIONS[subject.javaId] ?? [];
            const differences: string[] = [];
            if (conversions.length === 0) {
                // Java converts this mob into nothing, so it has to stay what it is.
                const probed = probe(subject.bedrock);
                ticksUntil(probed.entity, () => probed.transforms.length > 0, 2400);
                const into = probed.transforms[0]?.identifier;
                return into === undefined ? undefined : `it turns into ${into}, which Java never converts it into`;
            }
            for (const conversion of conversions) {
                const expected = bedrockEntity(conversion.into);
                const [shortest, longest] = runConversion(subject.bedrock, conversion);
                const into = shortest?.into ?? longest?.into;
                if (into === undefined) {
                    differences.push(`${conversion.start} never converts it`);
                    continue;
                }
                if (into !== expected)
                    differences.push(`${conversion.start} turns it into ${into}, where Java makes ${expected}`);
                if (shortest?.ticks !== conversion.ticks[0] || longest?.ticks !== conversion.ticks[1])
                    differences.push(
                        `${conversion.start} converts it after ${String(shortest?.ticks)} to ${String(longest?.ticks)} ticks, where ${conversion.java} takes ${conversion.ticks[0]} to ${conversion.ticks[1]}`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'villager-zombie-odds',
        java: 'A villager a zombie kills never converts on Easy, converts half the time on Normal, and always on Hard.',
        reference:
            'Java Zombie.killedEntity: Normal and Hard only, and on Normal a random.nextBoolean() that returns early',
        subjects: () => ['minecraft:villager'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:transformation'],
        run: (subject) => {
            const draws = [0.25, 0.75];
            const java: Readonly<Record<string, number>> = { easy: 0, normal: 1, hard: 2 };
            const differences = Object.entries(java).flatMap(([difficulty, expected]) => {
                const converted = draws.filter((draw) => {
                    const probed = probe(subject.bedrock, { difficulty, random: fixedRandom(draw) });
                    probed.entity.fire('become_zombie');
                    return ticksUntil(probed.entity, () => probed.transforms.length > 0, 5) !== undefined;
                }).length;
                return converted === expected
                    ? []
                    : [
                          `on ${difficulty}, ${converted} of ${draws.length} draws convert, where Java converts ${expected}`
                      ];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'breeding-cycle',
        java: "A fed adult falls in love for 600 ticks, a pair breeds a baby of Java's type, and both parents wait 6000 ticks before breeding again.",
        reference:
            'Java Animal.setInLove (600), Animal.finalizeSpawnChildFromBreeding (setAge(6000) on both parents), AbstractHorse and Llama handleEating, and getBreedOffspring of each animal; issue #2911 (bee and wolf food)',
        subjects: () => entitiesDeclaring('minecraft:breedable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:breedable'],
        run: (subject) => {
            const differences: string[] = [];
            const java = new Set(javaLoveFood(subject.javaId));
            const server = new Set(serverLoveFood(subject.bedrock));
            const missing = [...java].filter((item) => !server.has(item));
            const extra = [...server].filter((item) => !java.has(item));
            if (missing.length > 0 || extra.length > 0)
                differences.push(
                    `the server breeds it with ${[...server].sort().join(', ') || 'nothing'}, where Java uses ${[...java].sort().join(', ') || 'nothing'}`
                );

            const food = [...server][0];
            const bred = breed(subject.bedrock, subject.bedrock, food);
            if (typeof bred === 'string') return [...differences, bred].join('; ');
            if (!bred.loveByFilter && bred.loveTicks !== JAVA_LOVE_TICKS)
                differences.push(
                    `feeding it ${String(food)} puts it in love for ${bred.loveTicks} ticks, where Java's lasts ${JAVA_LOVE_TICKS}`
                );
            if (LAYS_INSTEAD.has(subject.javaId)) {
                if (bred.child !== undefined)
                    differences.push(`breeding makes a ${bred.child}, where Java lays an egg or spawn instead`);
            } else if (bred.child === undefined) differences.push('breeding makes no baby');
            else {
                const expected = bedrockEntity(subject.javaId);
                if (bred.child !== expected)
                    differences.push(`breeding makes a ${bred.child}, where Java makes a ${expected}`);
                if (!bred.childIsBaby) differences.push('the newborn is not a baby');
            }
            for (const cooldown of bred.cooldowns)
                if (cooldown !== JAVA_BREED_COOLDOWN)
                    differences.push(
                        `a parent waits ${cooldown} ticks to breed again, where Java waits ${JAVA_BREED_COOLDOWN}`
                    );
            return differences.length === 0 ? undefined : [...new Set(differences)].join('; ');
        }
    },
    {
        name: 'offspring-type',
        java: "Using a mob's own spawn egg on it makes a baby of Java's offspring type, and a horse and a donkey breed a mule.",
        reference:
            'Java SpawnEggItem.spawnOffspringFromSpawnEgg (getBreedOffspring for an AgeableMob, otherwise the egg type, then setBaby(true), refused when the child cannot be a baby as Frog.canBeABaby says), Horse.getBreedOffspring and Donkey.getBreedOffspring (MULE with the other); issue #3152',
        subjects: () => entitiesDeclaring('minecraft:offspring_data'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:offspring_data'],
        run: (subject) => {
            const differences: string[] = [];
            const egg = javaItemToBedrock(`${subject.javaId}_spawn_egg`);
            if (egg.kind === 'unknown') return `Java's ${subject.javaId}_spawn_egg maps to no Bedrock item`;
            const at = freshSpot();
            const adult = spawnLive(subject.bedrock, at);
            try {
                realStack().runtime.interactWithItem(adult.id, FEEDER, egg.bedrock.identifier);
                const children = newcomers(at, [adult]);
                cleanUp(children);
                const child = children[0];
                const expected = bedrockEntity(subject.javaId);
                if (NO_EGG_OFFSPRING.has(subject.javaId)) {
                    if (child !== undefined)
                        differences.push(`its spawn egg makes a ${child.identifier}, where Java's makes nothing`);
                } else if (child === undefined)
                    differences.push(`its spawn egg makes nothing, where Java makes a baby ${expected}`);
                else if (child.identifier !== expected)
                    differences.push(`its spawn egg makes a ${child.identifier}, where Java makes a ${expected}`);
            } finally {
                cleanUp([adult]);
            }

            // Java's horse and donkey breed a mule with each other.
            const partner =
                subject.javaId === 'minecraft:horse'
                    ? 'minecraft:donkey'
                    : subject.javaId === 'minecraft:donkey'
                      ? 'minecraft:horse'
                      : undefined;
            if (partner !== undefined) {
                const bred = breed(subject.bedrock, bedrockEntity(partner), 'minecraft:golden_carrot');
                const child = typeof bred === 'string' ? bred : bred.child;
                if (child !== bedrockEntity('minecraft:mule'))
                    differences.push(`with a ${partner} it breeds ${String(child)}, where Java breeds a mule`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'spawns-on-a-clock',
        java: 'A mob lays, sheds or brings along what Java makes it create, as many as Java does, after as long as Java waits.',
        reference:
            'Java Chicken.aiStep and gameplay/chicken_lay, Armadillo.pickNextScuteDropTime and gameplay/armadillo_shed, CopperGolem.shear, Drowned.finalizeSpawn, Sniffer.spawnChildFromBreeding and WanderingTraderSpawner.spawn',
        subjects: () => entitiesDeclaring('minecraft:spawn_entity'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:spawn_entity'],
        classify: (subject) =>
            subject.javaId === 'minecraft:ocelot'
                ? {
                      kind: 'intentional',
                      reason: "Bedrock spawns an ocelot with two kittens one time in seven, where Java's ocelot spawns alone. The litter is part of how Bedrock composes a natural spawn, and docs/data-driven/parity.md category 7 keeps Bedrock's spawn model."
                  }
                : undefined,
        run: (subject) => {
            const variantOf = (probed: Probe): string | undefined => {
                const value = probed.entity.filterContext().self.property?.('minecraft:climate_variant');
                return typeof value === 'string' ? value : undefined;
            };
            const quickest = spawnProbe(subject.bedrock, 0);
            const slowest = spawnProbe(subject.bedrock, 1 - Number.EPSILON);
            const java = javaSpawnOf(subject.javaId, variantOf(quickest));
            if (java === undefined) {
                const made = quickest.spawns.map((request) => request.identifier);
                quickest.entity.componentState.write('minecraft:spawn_entity', {
                    remaining: spawnClocks(quickest.entity).map(() => 1),
                    used: spawnClocks(quickest.entity).map(() => false)
                });
                quickest.entity.tick(false);
                const all = [...made, ...quickest.spawns.map((request) => request.identifier)];
                return all.length === 0 ? undefined : `it creates ${all.join(', ')}, which Java's never does`;
            }
            const differences: string[] = [];
            const shortest = Math.min(...spawnClocks(quickest.entity));
            const longest = Math.max(...spawnClocks(slowest.entity));
            if (shortest !== java.ticks[0] || longest !== java.ticks[1])
                differences.push(
                    `it waits ${shortest} to ${longest} ticks, where ${java.java} waits ${java.ticks[0]} to ${java.ticks[1]}`
                );

            const clocks = spawnClocks(quickest.entity);
            quickest.entity.componentState.write('minecraft:spawn_entity', {
                remaining: clocks.map(() => 1),
                used: clocks.map(() => false)
            });
            quickest.entity.tick(false);
            const made = quickest.spawns;
            const count = made.reduce((total, request) => total + request.count, 0);
            const wrong = made.filter(
                (request) => request.kind !== java.kind || request.identifier !== java.identifier
            );
            if (made.length === 0) differences.push(`it creates nothing, where Java creates ${java.identifier}`);
            else if (wrong.length > 0)
                differences.push(
                    `it creates ${wrong.map((request) => request.identifier).join(', ')}, where Java creates ${java.identifier}`
                );
            else if (count !== java.count) differences.push(`it creates ${count}, where Java creates ${java.count}`);
            if (java.leashed === true && made.some((request) => request.kind === 'entity' && !request.shouldLeash))
                differences.push('what it brings along is not leashed to it, where Java leashes it');
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'target-range',
        java: "A mob that acts on its target's distance starts and stops at Java's distances.",
        reference:
            'Java SwellGoal (creeper), Blaze$BlazeAttackGoal.tick, Guardian$GuardianAttackGoal.canContinueToUse and the Drowned goal setup (DrownedTridentAttackGoal before DrownedAttackGoal); issues #3129 (creeper) and #3158',
        subjects: () => entitiesDeclaring('minecraft:target_nearby_sensor'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:target_nearby_sensor'],
        run: (subject) => {
            const rule = TARGET_RANGES[subject.javaId];
            if (rule === undefined) return 'no Java distance rule is known for this sensor';
            const differences: string[] = [];
            const approach = [...SWEEP].reverse();
            for (const [phase, check, distances, settle] of [
                ['start', rule.start, approach, 0],
                ['stop', rule.stop, SWEEP, 3]
            ] as const) {
                if (check === undefined) continue;
                const server = firstRaised(subject.bedrock, check.event, distances, settle);
                const java = distances.find((distance) => check.holds(distance));
                if (server !== java)
                    differences.push(
                        `${check.event} fires at ${String(server)} blocks as the target ${phase === 'start' ? 'closes in' : 'backs off'}, where ${rule.java} acts at ${String(java)}`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'sensor-reach',
        java: 'A mob that senses the entities around it searches as far as Java looks.',
        reference:
            'Java Armadillo (inflate 7, 2, 7), Pufferfish$PufferfishPuffGoal (inflate 2) and HappyGhast.scanPlayerAboveGhast (getBoundingBox, 1 past each side, maxY to maxY + getYsize() / 2); issue #3158',
        subjects: () => entitiesDeclaring('minecraft:entity_sensor'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:entity_sensor'],
        classify: (subject) =>
            subject.javaId === 'minecraft:parrot'
                ? {
                      kind: 'intentional',
                      reason: "The parrot's sensor only switches where a perched parrot looks. A Java parrot on a shoulder is part of the player and is drawn by the client, so where it looks is rendered presentation, category 1 of docs/data-driven/parity.md."
                  }
                : undefined,
        run: (subject) => {
            // Each group that carries a sensor is a state of the mob, such as a puffed-up pufferfish,
            // and each one's search has to match Java's.
            const queries: EntitySensorQuery[] = [];
            for (const group of groupsDeclaring(subject.bedrock, 'minecraft:entity_sensor')) {
                const probed = probe(subject.bedrock, { sensorQueries: queries });
                activate(probed.entity, group);
                for (let tick = 0; tick < 20; tick += 1) probed.entity.tick(false);
            }
            if (queries.length === 0) return 'the server never searches for entities around it';
            const java = SENSOR_REACH[subject.javaId];
            if (java === undefined)
                return `it searches ${queries[0]?.horizontalRange} by ${queries[0]?.verticalRange} blocks, which no Java search is known for`;
            const wrong = queries.filter(
                (query) =>
                    query.verticalRange !== java.vertical ||
                    (java.horizontal !== undefined && query.horizontalRange !== java.horizontal) ||
                    (java.yOffset !== undefined && query.yOffset !== java.yOffset)
            );
            const described = (horizontal: number | string, vertical: number, yOffset: number | undefined): string =>
                `${horizontal} by ${vertical}${yOffset === undefined ? '' : ` ${yOffset} blocks up`}`;
            return wrong.length === 0
                ? undefined
                : `it searches ${[...new Set(wrong.map((query) => described(query.horizontalRange, query.verticalRange, java.yOffset === undefined ? undefined : query.yOffset)))].join(', ')} blocks, where ${java.java} searches ${described(java.horizontal ?? 'its own width', java.vertical, java.yOffset)}`;
        }
    },
    {
        name: 'guarded-blocks',
        java: 'Breaking a block Java guards angers the mobs Java angers, as far away as Java reaches.',
        reference:
            'Java BeehiveBlock.angerNearbyBees with the beehives tag, and PiglinAi.angerNearbyPiglins with the guarded_by_piglins tag; issue #3158',
        subjects: () => entitiesDeclaring('minecraft:block_sensor'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:block_sensor'],
        run: (subject) => {
            const java = BLOCK_GUARDS[subject.javaId];
            if (java === undefined) return 'no Java block guard is known for this sensor';
            const differences: string[] = [];
            const bodies = loadedComponentValues(subject.bedrock, 'minecraft:block_sensor');
            const server = new Set(
                bodies.flatMap((body) => {
                    const breaks = field(body, 'on_break');
                    return (Array.isArray(breaks) ? breaks : []).flatMap((entry: unknown) =>
                        stringList(field(entry, 'block_list'))
                    );
                })
            );
            const guarded = javaTagBlocks(java.tag);
            const missing = [...guarded].filter((block) => !server.has(block)).sort();
            const extra = [...server].filter((block) => !guarded.has(block)).sort();
            if (missing.length > 0)
                differences.push(`breaking ${missing.join(', ')} angers nothing, where Java's ${java.tag} guards it`);
            if (extra.length > 0)
                differences.push(`breaking ${extra.join(', ')} angers it, where Java guards none of them`);
            for (const body of bodies) {
                const radius = field(body, 'sensor_radius');
                if (radius !== java.radius)
                    differences.push(`it hears a break ${String(radius)} blocks away, where ${java.java}`);
            }

            // The server has to act on the break, not only read the list. A sensor that also filters
            // who broke the block, as the bee's silk-touch test does, needs a player to break it.
            if (bodies.some((body) => field(body, 'sources') !== undefined))
                return differences.length === 0 ? undefined : [...new Set(differences)].join('; ');
            const at = freshSpot();
            const mob = spawnLive(subject.bedrock, at);
            if (!mob.instance.hasComponent('minecraft:block_sensor'))
                activate(mob.instance, groupDeclaring(subject.bedrock, 'minecraft:block_sensor'));
            try {
                const block = [...server][0];
                // Broken by a mob with no silk touch, as a player's bare hand would.
                const breaker = spawnLive('minecraft:zombie', { ...at, z: at.z + 2 });
                try {
                    if (block !== undefined) {
                        realStack().runtime.blockBroken(
                            { x: Math.floor(at.x) + 1, y: Math.floor(at.y), z: Math.floor(at.z) },
                            block,
                            breaker.id
                        );
                        if (mob.instance.queued().length === 0)
                            differences.push(`breaking ${block} a block away does nothing to it`);
                    }
                } finally {
                    cleanUp([breaker]);
                }
            } finally {
                cleanUp([mob]);
            }
            return differences.length === 0 ? undefined : [...new Set(differences)].join('; ');
        }
    },
    {
        name: 'piglin-gold',
        java: "A piglin handed gold admires it for Java's ADMIRE_DURATION, then barters from Java's gameplay/piglin_bartering table.",
        reference: 'Java PiglinAi.mobInteract, PiglinAi.ADMIRE_DURATION and PiglinAi.getBarterResponseItems',
        subjects: () => ['minecraft:piglin'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:admire_item', 'minecraft:barter'],
        run: (subject) => {
            const differences: string[] = [];
            const admire = javaConstant('monster/piglin/PiglinAi', 'ADMIRE_DURATION');
            const { runtime, world } = realStack();
            const at = freshSpot();
            const piglin = spawnLive(subject.bedrock, at);
            try {
                if (piglin.instance.hasComponent('minecraft:is_baby')) return 'the piglin spawned as a baby';
                const accepted = runtime.interactWithItem(
                    piglin.id,
                    FEEDER,
                    'minecraft:gold_ingot',
                    playerHolding('minecraft:gold_ingot')
                ).accepted;
                if (!accepted) return 'it refuses a gold ingot from a player';
                const admiring = piglin.brain?.getTimeUntilExpiry(MemoryModuleTypes.ADMIRING_ITEM);
                if (admiring !== admire)
                    differences.push(
                        `it admires the ingot for ${String(admiring)} ticks, where Java's ADMIRE_DURATION is ${String(admire)}`
                    );

                const before = world.drops.length;
                for (let tick = 1; tick <= (admire ?? 120) + 20 && world.drops.length === before; tick += 1)
                    runtime.tick(tick);
                const bartered = world.drops.slice(before).map((drop) => drop.item.identifier);
                const java = javaLootItems('minecraft:gameplay/piglin_bartering');
                if (bartered.length === 0) differences.push('it bartered nothing once it stopped admiring');
                const foreign = bartered.filter((item) => !java.has(item));
                if (foreign.length > 0)
                    differences.push(`it bartered ${foreign.join(', ')}, which Java's piglin_bartering never gives`);
            } finally {
                cleanUp([piglin]);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'piglin-brain',
        java: "A piglin and a hoglin run Java's brain, which counts adult piglins and hoglins to decide who flees, and celebrates a hunt for Java's CELEBRATION_TIME.",
        reference: 'Java PiglinAi and HoglinAi constants, and the PiglinSpecificSensor and HoglinSpecificSensor counts',
        subjects: () =>
            entitiesDeclaring('minecraft:group_size')
                .concat(entitiesDeclaring('minecraft:celebrate_hunt'))
                .filter((subject, index, all) => all.findIndex((other) => other.javaId === subject.javaId) === index),
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            subject.javaId === 'minecraft:piglin'
                ? ['minecraft:group_size', 'minecraft:celebrate_hunt']
                : ['minecraft:group_size'],
        run: (subject) => {
            const brain = serverContent().entities.brains.get(subject.javaId);
            if (brain === undefined) return `the server runs no Java brain for ${subject.javaId}`;
            const differences: string[] = [];
            const at = freshSpot();
            const mob = spawnLive(subject.bedrock, at);
            try {
                if (mob.brain === undefined) differences.push('the spawned mob has no brain');
                for (const memory of [
                    MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT,
                    MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT
                ])
                    if (mob.brain !== undefined && !mob.brain.checkMemory(memory, 'registered'))
                        differences.push(`its brain keeps no ${memory.name}, which Java's specific sensor counts`);
            } finally {
                cleanUp([mob]);
            }
            const constants: readonly (readonly [string, number, string, string])[] =
                subject.javaId === 'minecraft:piglin'
                    ? [
                          ['celebration time', PIGLIN.celebrationTime, 'monster/piglin/PiglinAi', 'CELEBRATION_TIME'],
                          [
                              'celebration dance chance',
                              PIGLIN.probabilityOfCelebrationDance,
                              'monster/piglin/PiglinAi',
                              'PROBABILITY_OF_CELEBRATION_DANCE'
                          ],
                          [
                              'time between hunts',
                              PIGLIN.maxTimeBetweenHunts,
                              'monster/piglin/PiglinAi',
                              'MAX_TIME_BETWEEN_HUNTS'
                          ]
                      ]
                    : [
                          [
                              'retreat distance',
                              HOGLIN.desiredDistanceFromPiglinWhenRetreating,
                              'monster/hoglin/HoglinAi',
                              'DESIRED_DISTANCE_FROM_PIGLIN_WHEN_RETREATING'
                          ],
                          [
                              'idle distance from piglins',
                              HOGLIN.desiredDistanceFromPiglinWhenIdling,
                              'monster/hoglin/HoglinAi',
                              'DESIRED_DISTANCE_FROM_PIGLIN_WHEN_IDLING'
                          ]
                      ];
            for (const [label, server, className, name] of constants) {
                const java = javaConstant(className, name);
                if (java === undefined || Math.abs(server - java) > 1e-6)
                    differences.push(`its ${label} is ${server}, where Java's ${name} is ${String(java)}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'home-range',
        java: "A mob Java gives a home keeps it from where Java takes it, and its random wandering stays within the radius Java's setHomeTo gives it, or within none; a happy ghast or a tamed nautilus that strays past its radius plus Java's margin, unridden, takes a new home where it is, and a bee past its wander threshold heads back to its hive.",
        reference:
            'Java Turtle.finalizeSpawn, PiglinBruteAi.initMemories, every Mob.setHomeTo call (HappyGhast and AbstractNautilus checkRestriction, ElderGuardian.customServerAiStep, WanderingTraderSpawner.spawn), GoalUtils.mobRestricted and isRestricted, and Bee$BeeWanderGoal.getWanderThreshold and findPos; issues #3159 and #3170',
        subjects: () => entitiesDeclaring('minecraft:home'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:home'],
        run: (subject) => {
            const differences: string[] = [];
            const at = freshSpot();
            const mob = spawnLive(subject.bedrock, at);
            try {
                if (HOME_AT_SPAWN.has(subject.javaId) && mob.instance.homePosition === undefined)
                    differences.push('it keeps no home where it spawned, where Java does');
            } finally {
                cleanUp([mob]);
            }
            // Each home body the server runs, with the radius its stroll is held to, if any.
            const java = HOME_RADII[subject.javaId];
            const bodies = loadedComponentValues(subject.bedrock, 'minecraft:home');
            const held = bodies.flatMap((body) => {
                const radius = field(body, 'restriction_radius');
                if (typeof radius !== 'number' || radius <= 0) return [];
                // Inside the radius it strolls; past it, while still near home, it may not.
                const inside = wandersTo(body, 0, radius - 2);
                const outside = wandersTo(body, 0, radius + 2);
                // Java frees a mob that strayed past the radius plus its range plus one.
                const strayed = wandersTo(body, radius + WANDER_RANGE + 2, radius + WANDER_RANGE + 4);
                if (!inside || !strayed) differences.push(`a stroll ${radius} blocks from home never starts at all`);
                return outside ? [] : [radius];
            });
            differences.push(...rehomingDifferences(subject));
            if (subject.javaId === 'minecraft:bee') {
                // `getWanderThreshold`: 48 less 24 for a bee with a hive.
                const [withHive, , reach] = javaMethodNumbers(
                    'net/minecraft/world/entity/animal/bee/Bee$BeeWanderGoal',
                    'getWanderThreshold'
                );
                const threshold = reach === undefined || withHive === undefined ? undefined : reach - withHive;
                if (threshold === undefined) differences.push("Java's bee wander threshold could not be read");
                for (const body of loadedComponentValues(subject.bedrock, 'minecraft:behavior.random_hover')) {
                    if (threshold === undefined) break;
                    const far = hoverStepsAway(body, threshold + 6);
                    const near = hoverStepsAway(body, threshold - 6);
                    if (far.drawn === 0 || far.away > 0)
                        differences.push(
                            `${far.away} of ${far.drawn} wanders ${threshold + 6} blocks from its hive head away from it, where Java's bee heads back past ${threshold}`
                        );
                    if (near.away === 0)
                        differences.push(
                            `${threshold - 6} blocks from its hive every wander heads back, where Java's bee only turns back past ${threshold}`
                        );
                }
            }
            const server = [...new Set(held)].sort((left, right) => left - right).join(' or ');
            const expected = [...(java?.radii ?? [])].sort((left, right) => left - right).join(' or ');
            if (server !== expected)
                differences.push(
                    java === undefined
                        ? `the server holds its wandering within ${server} blocks of home, where Java holds it to no radius`
                        : `the server holds its wandering within ${server || 'no'} blocks of home, where ${java.java} holds it within ${expected}`
                );
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'village-dwelling',
        java: 'A villager belongs to a village through the bed and job site its brain claims, and no other mob belongs to one.',
        reference:
            "Java VillagerAi's AcquirePoi for HOME and JOB_SITE, PoiTypes.HOME (the beds tag); Java gives raiders, cats and iron golems no village membership",
        subjects: () => entitiesDeclaring('minecraft:dweller'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:dweller'],
        run: (subject) => {
            if (subject.javaId === 'minecraft:villager') {
                const brain = serverContent().entities.brains.get(subject.javaId);
                if (brain === undefined) return 'the server runs no Java brain for the villager';
                // Every Java bed is a home its brain can claim, found through the runtime's own index.
                const { runtime, world } = realStack();
                const missing = [...javaTagBlocks('minecraft:beds')].filter((bed) => {
                    const at = freshSpot();
                    const block = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
                    world.setBlock(block, bed);
                    runtime.invalidateBlockCaches();
                    const found = runtime.poi('minecraft:home', block, 2);
                    world.setBlock(block, 'minecraft:air');
                    return found === undefined;
                });
                return missing.length === 0
                    ? undefined
                    : `a villager finds no home at ${missing.join(', ')}, which Java's PoiTypes.HOME accepts`;
            }
            return runs('minecraft:dweller')
                ? 'the server makes it a village dweller, which Java never makes it'
                : undefined;
        }
    },
    {
        name: 'schedules',
        java: "A villager's day follows Java's villager_schedule timeline, and a fox's scheduled events only pick its ambient sound.",
        reference:
            'Java data/minecraft/timeline/villager_schedule.json, Villager.registerBrainGoals and Fox.getAmbientSound',
        subjects: () => entitiesDeclaring('minecraft:scheduler'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:scheduler'],
        classify: (subject) =>
            subject.javaId === 'minecraft:fox'
                ? {
                      kind: 'intentional',
                      reason: "The fox's scheduler only moves it between its sleeping, night and normal ambient sound groups. Which ambient sound plays is sound selection, rendered presentation in category 1 of docs/data-driven/parity.md."
                  }
                : undefined,
        run: (subject) => {
            if (subject.javaId === 'minecraft:fox')
                return runs('minecraft:scheduler') ? undefined : 'the server never runs its scheduled events';
            const brain = serverContent().entities.brains.get(subject.javaId);
            if (brain === undefined) return 'the server runs no Java brain, so no schedule';
            const differences: string[] = [];
            for (const [label, server, track] of [
                ['an adult', keyframesOf(VILLAGER_SCHEDULE), 'minecraft:gameplay/villager_activity'],
                ['a baby', keyframesOf(BABY_VILLAGER_SCHEDULE), 'minecraft:gameplay/baby_villager_activity']
            ] as const) {
                const java = javaScheduleTrack(track);
                if (server !== java) differences.push(`${label} follows ${server}, where Java's timeline is ${java}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'trade-offers',
        java: "A villager of each profession and level, and a wandering trader, offer the items Java's trade sets offer.",
        reference: 'Java data/minecraft/trade_set and villager_trade',
        subjects: () => entitiesDeclaring('minecraft:economy_trade_table'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:economy_trade_table'],
        run: (subject) => {
            const differences: string[] = [];
            const compare = (label: string, server: ReadonlySet<string>, java: ReadonlySet<string>): void => {
                const missing = [...java].filter((item) => !server.has(item)).sort();
                const extra = [...server].filter((item) => !java.has(item)).sort();
                if (missing.length > 0 || extra.length > 0)
                    differences.push(
                        `${label} ${missing.length > 0 ? `lacks ${missing.join(', ')}` : ''}${missing.length > 0 && extra.length > 0 ? ' and ' : ''}${extra.length > 0 ? `adds ${extra.join(', ')}` : ''}`
                    );
            };
            if (subject.javaId === 'minecraft:wandering_trader') {
                const server = new Set(
                    [0, 1, 2, 3].flatMap((tier) => [...bedrockTradeGives('wandering_trader', tier)])
                );
                const java = new Set(
                    ['buying', 'common', 'uncommon'].flatMap((set) => [...javaTradeGives(`wandering_trader/${set}`)])
                );
                compare('the wandering trader', server, java);
            } else {
                for (const [profession, file] of Object.entries(TRADE_FILES))
                    for (let level = 1; level <= 5; level += 1)
                        compare(
                            `a level ${level} ${profession}`,
                            bedrockTradeGives(file, level - 1),
                            javaTradeGives(`${profession}/level_${level}`)
                        );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'raiders',
        java: "Exactly Java's raider types join a raid, and a player with Bad Omen in a village starts one when the 600-tick Raid Omen it turns into runs out.",
        reference:
            'Java Raid.RaiderType, the raiders entity type tag, BadOmenMobEffect.applyEffectTick (RAID_OMEN for 600 ticks) and RaidOmenMobEffect; issue #3160',
        subjects: () => [
            ...entitiesDeclaring('minecraft:can_join_raid'),
            ...entitiesDeclaring('minecraft:raid_trigger')
        ],
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            subject.javaId === 'minecraft:player' ? ['minecraft:raid_trigger'] : ['minecraft:can_join_raid'],
        run: (subject) => {
            if (subject.javaId !== 'minecraft:player') {
                const raiders = new Set(RAIDER_TABLE.map(([type]) => type));
                const tagged = serverContent()
                    .tags.members('entity_type', 'minecraft:raiders')
                    .includes(subject.javaId);
                if (!tagged) return "Java's raiders tag does not hold it";
                return raiders.has(subject.javaId) ? undefined : 'the server never sends it in a raid wave';
            }
            const manager = new RaidManager(omenHost());
            for (let tick = 1; tick <= 700; tick += 1) {
                manager.tick();
                if (manager.records().length > 0)
                    return tick > 600
                        ? undefined
                        : `a raid starts ${tick} ticks after the omen-carrying player reaches the village, where Java's Raid Omen holds it off for 600`;
            }
            return 'a player with Bad Omen in a village never starts a raid';
        }
    },
    {
        name: 'trader-upkeep',
        java: 'A villager restocks at most twice a day and never within 2400 ticks of its last restock, and a wandering trader leaves 48000 ticks after it arrives.',
        reference:
            'Java Villager.allowedToRestock (numberOfRestocksToday < 2, gameTime > lastRestockGameTime + 2400) and WanderingTrader.maybeDespawn with WanderingTraderSpawner.setDespawnDelay(48000); issue #3157',
        subjects: () => [
            ...entitiesDeclaring('minecraft:trade_resupply'),
            ...entitiesDeclaring('minecraft:managed_wandering_trader')
        ],
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            subject.javaId === 'minecraft:villager'
                ? ['minecraft:trade_resupply']
                : ['minecraft:managed_wandering_trader'],
        run: (subject) => {
            if (subject.javaId !== 'minecraft:villager') {
                const clocks = [0, 1 - Number.EPSILON].map((draw) =>
                    clockOf(probe(subject.bedrock, { random: fixedRandom(draw) }).entity, 'minecraft:timer')
                );
                const wrong = clocks.filter((clock) => clock !== 48000);
                return wrong.length === 0
                    ? undefined
                    : `it leaves after ${wrong.map(String).join(' or ')} ticks, where Java's trader leaves after 48000`;
            }
            const { runtime, world } = realStack();
            const at = freshSpot();
            const villager = spawnLive(subject.bedrock, at);
            try {
                // A villager trades once it has a job; one that spawned jobless takes the first job
                // its definition gives, as a Java villager takes one at a job site.
                if (!villager.instance.hasComponent('minecraft:economy_trade_table'))
                    activate(villager.instance, groupDeclaring(subject.bedrock, 'minecraft:economy_trade_table'));
                const merchant = runtime.merchant(villager);
                if (merchant === undefined) return 'the villager has no trades to restock';
                const restocked = (): boolean => {
                    if (merchant.offers()[0] === undefined) return false;
                    merchant.trade(0);
                    runtime.villagerRestock(villager.body);
                    return merchant.offers()[0]?.uses === 0;
                };
                const outcomes: string[] = [];
                const java: readonly (readonly [number, boolean])[] = [
                    [0, true],
                    [2400, false],
                    [2401, true],
                    [4802, false]
                ];
                let elapsed = 0;
                for (const [offset, expected] of java) {
                    world.advance(offset - elapsed);
                    elapsed = offset;
                    const done = restocked();
                    if (done !== expected)
                        outcomes.push(
                            `${done ? 'it restocks' : 'it does not restock'} ${offset} ticks after the first, where Java ${expected ? 'does' : 'does not'}`
                        );
                }
                return outcomes.length === 0 ? undefined : outcomes.join('; ');
            } finally {
                cleanUp([villager]);
            }
        }
    },
    {
        name: 'schooling',
        java: "Three cod, salmon or tropical fish side by side gather under one leader, as Java's FollowFlockLeaderGoal gathers them, in schools no larger than Java's; a pufferfish or a dolphin never schools.",
        reference:
            'Java AbstractSchoolingFish (getMaxSchoolSize, addFollowers, inRangeOfLeader), Salmon.getMaxSchoolSize, AbstractFish.getMaxSpawnClusterSize and FollowFlockLeaderGoal; Pufferfish and Dolphin do not extend AbstractSchoolingFish; issue #3161',
        subjects: () => entitiesDeclaring('minecraft:flocking'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:flocking'],
        run: (subject) => {
            const differences: string[] = [];
            const schools = JAVA_SCHOOLING.has(subject.javaId);
            if (schools) {
                const java = javaMaxSchoolSize(subject.javaId);
                const server = loadedComponentValues(subject.bedrock, 'minecraft:flocking').map((body) =>
                    field(body, 'high_flock_limit')
                );
                if (server.some((limit) => limit !== java))
                    differences.push(
                        `its schools hold up to ${server.join(' or ')} fish, where Java's hold ${String(java)}`
                    );
            }

            // Three fish a block apart, ticked by the server's own runtime until Java's first
            // school would have formed (FollowFlockLeaderGoal waits 200 to 219 ticks).
            const { runtime } = realStack();
            const at = freshSpot();
            const fish = [0, 1, 2].map((offset) => spawnLive(subject.bedrock, { ...at, x: at.x + offset }));
            try {
                for (let tick = 1; tick <= 240; tick += 1) runtime.tick(tick);
                const followers = fish.filter((one) => one.body.school.leader !== undefined).length;
                if (schools && followers !== 2)
                    differences.push(
                        `${followers} of three fish side by side follow a leader, where Java gathers all three into one school`
                    );
                if (!schools && followers > 0)
                    differences.push(`${followers} of three side by side follow a leader, where Java's never schools`);
            } finally {
                cleanUp(fish);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
