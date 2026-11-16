import { isBribed, spendBribe } from '@jsprismarine/entities/components/bribeable';
import { buckMount, temperOfMount } from '@jsprismarine/entities/components/tamemount';
import type { EntityInstance } from '@jsprismarine/entities/entityInstance';
import type { FilterEntityView } from '@jsprismarine/entities/filterContext';
import { isRideableParams } from '@jsprismarine/entities/riding';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { javaIdentifierToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';
import type { BiomeTagIndex } from '@jsprismarine/prismarine/content/biomeTags';
import { parseBiomeTags } from '@jsprismarine/prismarine/content/biomeTags';
import type { ContentEntity, ContentPosition } from '@jsprismarine/prismarine/content/world/adapter';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { FLOOR_Y, TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import type { JavaEntityState } from '../javaEntityClasses.ts';
import { pinnedJavaClass } from '../javaClassFile.ts';
import { unpackVanillaDatapack } from '../javaDatapack.ts';
import {
    evaluateJavaMethod,
    javaConstantsPassedTo,
    javaEntityClasses,
    javaIsA,
    javaItemBranchValues,
    javaPlayerRideLimit,
    javaRandomBounds,
    javaResolveMethod
} from '../javaEntityClasses.ts';
import { realStack } from '../serverStack.ts';
import type { EntitySubject } from './subjects.ts';
import {
    componentValues,
    entitiesDeclaring,
    field,
    javaEntityIds,
    mappedEntity,
    stringList,
    withNamespace
} from './subjects.ts';

/**
 * Scenarios for how a player interacts with a mob and what identifies it: its type families,
 * name tags, leads, seats, spawn eggs, held-item interactions, taming, and the components that
 * pick its variant.
 */

const ENTITY = 'net/minecraft/world/entity';

/** One live entity of the server's runtime, as `EntityRuntime.spawn` returns it. */
type DataEntity = NonNullable<ReturnType<EntityRuntime['spawn']>>;

/** The runtime id the scenarios' player has. */
const PLAYER = 7;

/** Where a scenario spawns its subject: on the test world's stone floor. */
const GROUND: ContentPosition = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A fresh entity's state as Java's rule methods read it: not angry, tamed, ridden or carrying anything. */
const FRESH: JavaEntityState = {
    getters: {
        isAngry: false,
        isTamed: false,
        isTame: false,
        isMobControlled: false,
        isAggravated: false,
        hasBodyItem: false,
        isBaby: false,
        isSaddled: false,
        isEyeInFluid: false
    }
};

/** One server runtime over the real content, with a player and a random roll the scenario sets. */
interface Bench {
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
    /** The value every random draw returns until the scenario changes it. */
    roll: number;
    /** Moves the scenario's player. */
    readonly placePlayer: (position: ContentPosition) => void;
}

/**
 * A runtime of its own over the shared content, so a scenario controls the random draws and the
 * player, and one subject's entities never meet another's.
 */
const bench = (dayTime?: number, biome?: string): Bench => {
    // TNT explodes by default, which a primed TNT minecart's interaction checks.
    const world = new TestEntityWorld({
        gameRules: { tntExplodes: true },
        ...(dayTime === undefined ? {} : { dayTime })
    });
    const tags = biome === undefined ? undefined : (bedrockBiomeTags().get(biome) ?? []);
    const player = (position: ContentPosition): ContentEntity => ({
        id: PLAYER,
        identifier: 'minecraft:player',
        position
    });
    world.players = [player({ x: GROUND.x + 2, y: GROUND.y, z: GROUND.z })];
    const state: Bench = {
        world,
        roll: 0.5,
        placePlayer: (position) => {
            world.players = [player(position)];
        },
        runtime: new EntityRuntime({
            content: () => realStack().content,
            world: {
                ...world.world,
                ...(biome === undefined || tags === undefined
                    ? {}
                    : { blocks: { ...world.world.blocks, biome: () => biome, biomeTags: () => tags } }),
                random: {
                    nextFloat: () => state.roll,
                    nextInt: (bound) => (bound <= 0 ? 0 : Math.min(bound - 1, Math.floor(state.roll * bound)))
                }
            },
            host: {
                ...world.host,
                playerIdForIdentity: (identity) => (identity === `player-${PLAYER}` ? PLAYER : undefined)
            },
            report: () => undefined
        })
    };
    return state;
};

let biomeTagIndex: BiomeTagIndex | undefined;

/** The Bedrock biome tags of each Bedrock biome, which the spawn events' biome filters read. */
const bedrockBiomeTags = (): BiomeTagIndex => {
    biomeTagIndex ??= parseBiomeTags(realStack().content.biomes);
    return biomeTagIndex;
};

/** Spawns a subject in a bench, or throws so the row reads as a scenario failure. */
const spawnIn = (current: Bench, bedrock: string, at: ContentPosition = GROUND): DataEntity => {
    const entity = current.runtime.spawn(bedrock, at);
    if (entity === undefined) throw new Error(`the server spawns no ${bedrock}`);
    // Events a spawn raised, such as a gene's birth event, apply on the entity's next tick, before
    // any player could reach it.
    entity.instance.applyQueuedEvents();
    return entity;
};

/**
 * Spawns a subject grown up, which every probe of an adult's interaction needs: a spawn that
 * rolled a baby fires the grow-up event the definition declares.
 */
const adultIn = (current: Bench, bedrock: string): DataEntity => {
    const entity = spawnIn(current, bedrock);
    if (entity.instance.hasComponent('minecraft:is_baby')) {
        entity.instance.fire('minecraft:ageable_grow_up');
        entity.instance.applyQueuedEvents();
    }
    if (entity.instance.hasComponent('minecraft:is_baby'))
        throw new Error(`${bedrock} spawned a baby that never grows up`);
    return entity;
};

/** The Java class an entity type constructs, or throws so the row reads as a scenario failure. */
const javaClassOf = (javaId: string): string => {
    const className = javaEntityClasses().get(javaId);
    if (className === undefined) throw new Error(`the Java jar registers no class for ${javaId}`);
    return className;
};

/** Whether a Java entity class's rule method answers true for a fresh entity. */
const javaRule = (javaId: string, method: string, state: JavaEntityState = FRESH): boolean =>
    evaluateJavaMethod(javaClassOf(javaId), method, state) !== 0;

/** The Bedrock identifier a Java item maps to, or the Java identifier when it maps to none. */
const bedrockItem = (javaItem: string): string => {
    const mapped = javaItemToBedrock(javaItem);
    return mapped.kind === 'unknown' ? javaItem : mapped.bedrock.identifier;
};

/** The Java item tag's members, as the server's tags resolve them, in Bedrock identifiers. */
const itemTag = (tag: string): readonly string[] =>
    realStack()
        .content.tags.members('item', tag)
        .map((item) => bedrockItem(item));

/** Every entity a Java subject list names, listed once per aspect. */
const subjectsDeclaring =
    (component: string): (() => readonly EntitySubject[]) =>
    () =>
        entitiesDeclaring(component);

/** The Java entity-type tags whose members Java treats as one family, and the Bedrock family each names. */
const FAMILY_TAGS: readonly (readonly [tag: string, family: string, rule: string])[] = [
    ['minecraft:undead', 'undead', 'Smite, inverted healing and harm, and the wither leaving them alone'],
    ['minecraft:arthropod', 'arthropod', 'Bane of Arthropods'],
    ['minecraft:illager', 'illager', 'illager friendship in raids'],
    ['minecraft:aquatic', 'aquatic', 'Impaling']
];

/** Who carries the scenarios' leads: a player at a distance the scenario picks. */
const leashedTo = (current: Bench, entity: DataEntity): boolean =>
    current.runtime.leashHolderIdentityOf(entity.id) !== undefined;

/** Ticks a bench's runtime a number of times. */
const tickBench = (current: Bench, ticks: number): void => {
    for (let tick = 1; tick <= ticks; tick++) current.runtime.tick(tick);
};

/** The entity types the server resolved, with its overlays, which a scenario spawns bare instances from. */
const serverTypes = () => realStack().content.entities.types;

let familyCarriers: ReadonlyMap<string, readonly [identifier: string, group: string | undefined]> | undefined;

/**
 * A rider for a seat test: an instance of an entity type in one of the allowed families, with the
 * component group that gives it the family active.
 */
const riderFor = (families: readonly string[]): EntityInstance | undefined => {
    const types = serverTypes();
    if (familyCarriers === undefined) {
        const found = new Map<string, readonly [string, string | undefined]>();
        for (const identifier of types.registry.keys()) {
            for (const family of types.spawn(identifier).families())
                if (!found.has(family)) found.set(family, [identifier, undefined]);
            for (const group of types.registry.get(identifier)?.groups.values() ?? []) {
                const params = group.components.find((component) => component.name === 'minecraft:type_family')?.params;
                for (const family of stringList(field(params, 'family')))
                    if (!found.has(family)) found.set(family, [identifier, group.name]);
            }
        }
        familyCarriers = found;
    }
    const carrier = (families.length === 0 ? ['player'] : families)
        .map((family) => familyCarriers?.get(family))
        .find((candidate) => candidate !== undefined);
    if (carrier === undefined) return undefined;
    const [identifier, group] = carrier;
    const rider = types.spawn(identifier);
    if (group !== undefined) rider.restoreComponentGroups([...rider.activeComponentGroups(), group]);
    return rider;
};

/**
 * How many riders a Java vehicle carries in play: as many as `canAddPassenger` admits, but no more
 * than its `mobInteract` seats players. Camel's admits three, yet `Camel.mobInteract` seats a
 * player only below two, `/ride` forces past `canAddPassenger`, and no vanilla mob mounts a camel
 * on its own, so its third seat is never filled. A hoglin's one seat holds a stack of baby
 * piglins, each on the one below, as deep as `Piglin.startRiding` climbs with `getTopPassenger`.
 */
const javaSeats = (javaId: string): number => {
    const className = javaClassOf(javaId);
    if (javaId === 'minecraft:hoglin') {
        const [depth] = javaConstantsPassedTo(
            `${ENTITY}/monster/piglin/Piglin`,
            'startRiding',
            `${ENTITY}/monster/piglin/Piglin.getTopPassenger`
        );
        if (depth === undefined) throw new Error('Piglin.startRiding no longer climbs a stack');
        return depth;
    }
    let seats = 0;
    while (seats < 8 && evaluateJavaMethod(className, 'canAddPassenger', { ...FRESH, passengers: seats }) !== 0)
        seats += 1;
    const players = javaPlayerRideLimit(className);
    return players === undefined ? seats : Math.min(seats, players);
};

/** How many riders the server seats on an entity in the rideable state that seats the most, by mounting them. */
const serverSeats = (bedrock: string): number => {
    const types = serverTypes();
    const vehicle = types.spawn(bedrock);
    const groups = [...vehicle.type.groups.values()]
        .filter((group) => group.components.some((component) => component.name === 'minecraft:rideable'))
        .map((group) => group.name);
    const base = vehicle.activeComponentGroups();
    let most = 0;
    for (const extra of [undefined, ...groups]) {
        const fresh = types.spawn(bedrock);
        fresh.restoreComponentGroups(extra === undefined ? base : [...base, extra]);
        const params = fresh.componentParams('minecraft:rideable');
        if (!isRideableParams(params)) continue;
        let seated = 0;
        for (let attempt = 0; attempt <= params.seatCount; attempt++) {
            const rider = riderFor(params.familyTypes);
            if (rider !== undefined && fresh.mount(rider)) seated += 1;
        }
        most = Math.max(most, seated);
    }
    return most;
};

/** Whether a Java entity class can be made a baby, which is what a spawn egg used on it needs. */
const javaCanBeBaby = (javaId: string): boolean => {
    const className = javaClassOf(javaId);
    if (javaResolveMethod(className, 'canBeABaby') !== undefined && !javaRule(javaId, 'canBeABaby')) return false;
    const setter = javaResolveMethod(className, 'setBaby', '(Z)V');
    return setter !== undefined && setter.owner !== `${ENTITY}/Mob` && setter.owner !== `${ENTITY}/LivingEntity`;
};

/** The spawn egg Java gives an entity type, as the server names it. */
const spawnEggOf = (javaId: string): string => bedrockItem(`${javaId}_spawn_egg`);

/** One item a player uses on a mob, and what Java does with it. */
interface InteractProbe {
    /** The item, or `#tag` for the first member of a Java item tag. */
    readonly item: string;
    /** `accept` means Java uses the item; a string is the item Java hands back; `reject` means Java ignores it. */
    readonly java: 'accept' | 'reject' | string;
    readonly why: string;
    /** `dye` uses the item the way a dye's item behavior does, through `EntityRuntime.dyeEntity`. */
    readonly via?: 'dye';
}

const SADDLE_REFUSED: InteractProbe = {
    item: 'minecraft:saddle',
    java: 'reject',
    why: 'an untamed horse cannot use the slot'
};

/**
 * What Java's `mobInteract` (or `Entity.interact`) does with the items each mob whose server
 * definition declares `minecraft:interact` reacts to, read from the item checks in each class's
 * method in the 26.3 jar. Every subject is probed with a stick too, which no Java mob but the
 * allay takes.
 */
const INTERACT_PROBES: Readonly<Record<string, readonly InteractProbe[]>> = {
    'minecraft:allay': [{ item: 'minecraft:diamond', java: 'accept', why: 'Allay.mobInteract hands it the item' }],
    'minecraft:armadillo': [{ item: 'minecraft:brush', java: 'accept', why: 'Armadillo.brushOffScute' }],
    'minecraft:bee': [
        {
            item: 'minecraft:wither_rose',
            java: 'accept',
            why: 'Bee.mobInteract feeds it a flower with a bee interaction effect'
        }
    ],
    'minecraft:bogged': [{ item: 'minecraft:shears', java: 'accept', why: 'Bogged.shear' }],
    'minecraft:camel': [{ item: 'minecraft:saddle', java: 'accept', why: 'an adult camel equips a saddle' }],
    'minecraft:camel_husk': [{ item: 'minecraft:saddle', java: 'accept', why: 'CamelHusk inherits Camel.mobInteract' }],
    'minecraft:copper_golem': [
        { item: 'minecraft:honeycomb', java: 'accept', why: 'CopperGolem waxes with honeycomb' }
    ],
    'minecraft:cow': [{ item: 'minecraft:bucket', java: 'minecraft:milk_bucket', why: 'AbstractCow milks an adult' }],
    'minecraft:creeper': [
        { item: 'minecraft:flint_and_steel', java: 'accept', why: 'Creeper ignites from #creeper_igniters' }
    ],
    'minecraft:donkey': [
        SADDLE_REFUSED,
        { item: 'minecraft:wheat', java: 'accept', why: 'AbstractHorse.fedFood eats horse_food' }
    ],
    'minecraft:goat': [{ item: 'minecraft:bucket', java: 'minecraft:milk_bucket', why: 'Goat milks an adult' }],
    'minecraft:happy_ghast': [
        { item: '#minecraft:harnesses', java: 'accept', why: 'an adult happy ghast equips a harness' }
    ],
    'minecraft:horse': [
        SADDLE_REFUSED,
        { item: 'minecraft:wheat', java: 'accept', why: 'AbstractHorse.fedFood eats horse_food' }
    ],
    'minecraft:iron_golem': [
        { item: 'minecraft:iron_ingot', java: 'reject', why: 'IronGolem only heals when hurt, and a fresh one is not' }
    ],
    'minecraft:llama': [
        { item: 'minecraft:white_carpet', java: 'reject', why: 'an untamed llama cannot wear a carpet' },
        { item: 'minecraft:wheat', java: 'accept', why: 'Llama.handleEating eats llama_food' }
    ],
    'minecraft:mooshroom': [
        { item: 'minecraft:bucket', java: 'minecraft:milk_bucket', why: 'AbstractCow milks an adult' },
        { item: 'minecraft:bowl', java: 'minecraft:mushroom_stew', why: 'MushroomCow fills a bowl' },
        { item: 'minecraft:shears', java: 'accept', why: 'MushroomCow.shear' }
    ],
    'minecraft:mule': [
        SADDLE_REFUSED,
        { item: 'minecraft:wheat', java: 'accept', why: 'AbstractHorse.fedFood eats horse_food' }
    ],
    'minecraft:nautilus': [
        { item: 'minecraft:pufferfish', java: 'accept', why: 'AbstractNautilus.tryToTame takes nautilus_taming_items' }
    ],
    'minecraft:pig': [{ item: 'minecraft:saddle', java: 'accept', why: 'an adult pig equips a saddle' }],
    'minecraft:piglin': [{ item: 'minecraft:gold_ingot', java: 'accept', why: 'PiglinAi admires a loved item' }],
    'minecraft:sheep': [
        { item: 'minecraft:shears', java: 'accept', why: 'Sheep.shear' },
        { item: 'red', java: 'accept', why: 'DyeItem.interactLivingEntity dyes a white sheep', via: 'dye' }
    ],
    'minecraft:shulker': [
        { item: 'red', java: 'reject', why: 'DyeItem.interactLivingEntity dyes only a sheep', via: 'dye' }
    ],
    'minecraft:snow_golem': [{ item: 'minecraft:shears', java: 'accept', why: 'SnowGolem.shear' }],
    'minecraft:strider': [{ item: 'minecraft:saddle', java: 'accept', why: 'an adult strider equips a saddle' }],
    'minecraft:sulfur_cube': [
        {
            item: '#minecraft:sulfur_cube_swallowable',
            java: 'accept',
            why: 'SulfurCube.mobInteract swallows a sulfur_cube_swallowable item'
        }
    ],
    'minecraft:tnt_minecart': [
        {
            item: 'minecraft:flint_and_steel',
            java: 'reject',
            why: 'MinecartTNT has no interact; only fire, damage and an activator rail prime it'
        }
    ],
    'minecraft:trader_llama': [
        { item: 'minecraft:white_carpet', java: 'reject', why: 'an untamed llama cannot wear a carpet' }
    ],
    'minecraft:wolf': [
        { item: 'minecraft:bone', java: 'accept', why: 'Wolf.tryToTame' },
        {
            item: 'red',
            java: 'reject',
            why: "Wolf.mobInteract dyes only its owner's tamed wolf's collar",
            via: 'dye'
        }
    ],
    'minecraft:zombie_horse': [
        SADDLE_REFUSED,
        { item: 'minecraft:red_mushroom', java: 'accept', why: 'AbstractHorse.fedFood eats zombie_horse_food' }
    ],
    'minecraft:zombie_nautilus': [
        { item: 'minecraft:pufferfish', java: 'accept', why: 'AbstractNautilus.tryToTame takes nautilus_taming_items' }
    ],
    'minecraft:zombie_villager': [
        { item: 'minecraft:golden_apple', java: 'reject', why: 'ZombieVillager cures only under Weakness' }
    ]
};

/** A probe's item, resolving a `#tag` to its first member. */
const probeItem = (item: string): string => {
    if (!item.startsWith('#')) return item;
    const [first] = itemTag(item.slice(1));
    if (first === undefined) throw new Error(`Java's ${item} tag holds no item`);
    return first;
};

/** What the server does with a probe item, in the terms of {@link InteractProbe.java}. */
const serverInteract = (current: Bench, entity: DataEntity, item: string): string => {
    const result = current.runtime.interactWithItem(entity.id, PLAYER, item, holding(item));
    if (!result.accepted) return 'reject';
    const handed = result.resultItem ?? result.addedItems?.[0]?.identifier;
    if (handed === undefined) return 'accept';
    return result.resultItemData === undefined ? handed : `${handed}:${result.resultItemData}`;
};

/** The scenarios' player as entity filters read it, holding one item in its main hand. */
const holding = (item: string): FilterEntityView => ({
    id: () => PLAYER,
    flag: (name) => (name === 'is_sneak_held' ? false : undefined),
    names: (name) => (name === 'is_family' ? ['player'] : undefined),
    equipment: (slot, index) =>
        (slot === 'hand' || slot === 'main_hand') && (index ?? 0) === 0
            ? {
                  identifier: () => item,
                  data: () => 0,
                  tags: () => realStack().content.items.types.get(item)?.tags ?? []
              }
            : undefined
});

/** One Java taming rule: the class and method that rolls, and the items that start a roll. */
interface TamingRule {
    readonly className: string;
    readonly method: string;
    readonly items: () => readonly string[];
}

const TAMING: Readonly<Record<string, TamingRule>> = {
    'minecraft:wolf': {
        className: `${ENTITY}/animal/wolf/Wolf`,
        method: 'tryToTame',
        items: () => ['minecraft:bone']
    },
    'minecraft:cat': {
        className: `${ENTITY}/animal/feline/Cat`,
        method: 'tryToTame',
        items: () => itemTag('minecraft:cat_food')
    },
    'minecraft:parrot': {
        className: `${ENTITY}/animal/parrot/Parrot`,
        method: 'mobInteract',
        items: () => itemTag('minecraft:parrot_food')
    },
    'minecraft:nautilus': {
        className: `${ENTITY}/animal/nautilus/AbstractNautilus`,
        method: 'tryToTame',
        items: () => itemTag('minecraft:nautilus_taming_items')
    },
    'minecraft:zombie_nautilus': {
        className: `${ENTITY}/animal/nautilus/AbstractNautilus`,
        method: 'tryToTame',
        items: () => itemTag('minecraft:nautilus_taming_items')
    }
};

/** Whether a fresh entity of a subject is tamed after one feeding at a given random roll. */
const tamesAt = (bedrock: string, item: string, roll: number): boolean => {
    const current = bench();
    const entity = spawnIn(current, bedrock);
    current.roll = roll;
    current.runtime.interactWithItem(entity.id, PLAYER, item, holding(item));
    return entity.body.owner !== undefined;
};

/** The items a component lists under one key, namespaced, whether written as names or `{ item }` objects. */
const listedItems = (bedrock: string, component: string, key: string): ReadonlySet<string> =>
    new Set(
        componentValues(bedrock, component).flatMap((value) => {
            const items = field(value, key);
            return (Array.isArray(items) ? items : [items]).flatMap((entry) =>
                typeof entry === 'string' ? [withNamespace(entry)] : stringList(field(entry, 'item')).map(withNamespace)
            );
        })
    );

/** The Java food tag each tamemount carrier's AbstractHorse.handleEating or Llama.handleEating reads. */
const HORSE_FOOD: Readonly<Record<string, string>> = {
    'minecraft:horse': 'minecraft:horse_food',
    'minecraft:donkey': 'minecraft:horse_food',
    'minecraft:mule': 'minecraft:horse_food',
    'minecraft:zombie_horse': 'minecraft:zombie_horse_food',
    'minecraft:llama': 'minecraft:llama_food',
    'minecraft:trader_llama': 'minecraft:llama_food'
};

/** Java's panda gene for one `nextInt(16)` draw, from Panda.Gene.getRandom. */
const javaPandaGene = (draw: number): string =>
    draw === 0
        ? 'lazy'
        : draw === 1
          ? 'worried'
          : draw === 2
            ? 'playful'
            : draw === 4
              ? 'aggressive'
              : draw < 9
                ? 'weak'
                : draw < 11
                  ? 'brown'
                  : 'normal';

/** A `Panda.Gene.getRandom` draw that makes each gene, for spawning a parent of a known gene. */
const PANDA_GENE_DRAWS: Readonly<Record<string, number>> = { lazy: 0, worried: 1, weak: 5, brown: 9, normal: 12 };

/** Java's recessive genes, `Panda.Gene.isRecessive`. */
const RECESSIVE_PANDA_GENES: ReadonlySet<string> = new Set(['weak', 'brown']);

/**
 * Java's cub of two parents whose main and hidden genes match, when every draw returns the roll:
 * `Panda.setGeneFromParents` orders the parents on `nextBoolean`, takes the main or hidden gene of
 * each on another, mutates each on `nextInt(32) == 0`, and `getVariantFromGenes` shows a
 * recessive main gene only when the hidden gene matches it.
 */
const javaPandaCub = (father: string, mother: string, roll: number): string => {
    const heads = roll < 0.5;
    let main = heads ? father : mother;
    let hidden = heads ? mother : father;
    if (Math.floor(roll * 32) === 0) main = javaPandaGene(Math.floor(roll * 16));
    if (Math.floor(roll * 32) === 0) hidden = javaPandaGene(Math.floor(roll * 16));
    if (!RECESSIVE_PANDA_GENES.has(main)) return main;
    return main === hidden ? main : 'normal';
};

/** Parent pairs and the roll their cub is drawn with. */
const PANDA_CROSSES: readonly (readonly [father: string, mother: string, roll: number])[] = [
    ['lazy', 'brown', 0.25],
    ['lazy', 'brown', 0.75],
    ['brown', 'brown', 0.75],
    ['weak', 'normal', 0.25],
    ['normal', 'worried', 0.75],
    ['brown', 'brown', 0.01]
];

/** The panda gene each Bedrock `minecraft:variant` value shows, from the panda's own variant groups. */
const BEDROCK_PANDA_VARIANTS: readonly string[] = [
    'normal',
    'lazy',
    'worried',
    'playful',
    'brown',
    'weak',
    'aggressive'
];

/** Midday and midnight, as the bench's day time. */
const NOON = 6000;
const NIGHT = 18000;

/** The Bedrock identifier of a Java or Bedrock entity identifier. */
const bedrockEntity = (identifier: string): string =>
    mappedEntity(withNamespace(identifier))?.bedrock ?? withNamespace(identifier);

/** Where Java seats a vehicle's jockey riders, and the server spawn that should carry them. */
interface JockeySource {
    /** The Java class and method that create and seat the riders. */
    readonly className: string;
    readonly method: string;
    /** Entity types the method names that are not riders: the vehicle itself, read as Java ids. */
    readonly exclude: readonly string[];
    /** A rider that is the method's own entity, such as the husk that rides its camel husk. */
    readonly self?: string;
    /** The event Bedrock's spawn rules or raids spawn the jockey with, absent for a natural spawn. */
    readonly event?: string;
    /** The roll the server's spawn draws with, low enough to take a natural jockey branch. */
    readonly roll: number;
}

const SPIDER_JOCKEY: JockeySource = {
    className: `${ENTITY}/monster/spider/Spider`,
    method: 'finalizeSpawn',
    exclude: [],
    roll: 0.001
};

const JOCKEY_SOURCES: Readonly<Record<string, JockeySource>> = {
    'minecraft:spider': SPIDER_JOCKEY,
    // CaveSpider inherits Spider.finalizeSpawn.
    'minecraft:cave_spider': SPIDER_JOCKEY,
    'minecraft:strider': {
        className: `${ENTITY}/monster/Strider`,
        method: 'finalizeSpawn',
        exclude: [],
        event: 'spawn_adult_piglin_jockey',
        roll: 0.5
    },
    'minecraft:zombie_horse': {
        className: `${ENTITY}/animal/equine/ZombieHorse`,
        method: 'finalizeSpawn',
        exclude: [],
        event: 'minecraft:spawn_adult_with_rider',
        roll: 0.5
    },
    'minecraft:camel_husk': {
        className: `${ENTITY}/monster/zombie/Husk`,
        method: 'finalizeSpawn',
        exclude: ['minecraft:camel_husk'],
        self: 'minecraft:husk',
        event: 'minecraft:spawn_with_rider',
        roll: 0.5
    },
    'minecraft:ravager': {
        className: `${ENTITY}/raid/Raid`,
        method: 'spawnGroup',
        exclude: ['minecraft:ravager'],
        event: 'minecraft:spawn_for_raid_with_pillager_rider',
        roll: 0.5
    }
};

/** The entity types a Java method creates as a vehicle's riders, as Java ids. */
const javaRiderTypes = (source: JockeySource, vehicle: string): ReadonlySet<string> => {
    const method = pinnedJavaClass(source.className).find((candidate) => candidate.name === source.method);
    const types = new Set<string>(source.self === undefined ? [] : [source.self]);
    for (const instruction of method?.instructions ?? []) {
        const member = instruction.member;
        if (instruction.opcode !== 0xb2 || member?.startsWith('net/minecraft/world/entity/EntityTypes.') !== true)
            continue;
        const javaId = `minecraft:${member.slice(member.lastIndexOf('.') + 1).toLowerCase()}`;
        if (!source.exclude.includes(javaId) && javaId !== vehicle) types.add(javaId);
    }
    // A strider's baby strider jockey is its own type, so a vehicle's own type counts when the
    // method seats one.
    if (vehicle === 'minecraft:strider') types.add('minecraft:strider');
    return types;
};

/** Java's chance of each jockey rider for an adult, from its `finalizeSpawn` `nextInt` bounds. */
interface JockeyChance {
    readonly className: string;
    readonly java: (bounds: readonly number[]) => readonly (readonly [rider: string, chance: number])[];
}

const SPIDER_CHANCE: JockeyChance = {
    className: `${ENTITY}/monster/spider/Spider`,
    java: ([jockey = 0]) => [['minecraft:skeleton', 1 / jockey]]
};

const JOCKEY_CHANCES: Readonly<Record<string, JockeyChance>> = {
    'minecraft:spider': SPIDER_CHANCE,
    'minecraft:cave_spider': SPIDER_CHANCE,
    'minecraft:strider': {
        className: `${ENTITY}/monster/Strider`,
        java: ([piglin = 0, parent = 0]) => [
            [bedrockEntity('minecraft:zombified_piglin'), 1 / piglin],
            ['minecraft:strider', (1 - 1 / piglin) / parent]
        ]
    }
};

/** Tames a fresh subject for the scenario's player the way a successful taming roll does. */
const tamedIn = (current: Bench, bedrock: string): DataEntity => {
    const entity = spawnIn(current, bedrock);
    current.runtime.setOwner(entity.id, PLAYER);
    entity.instance.fire('minecraft:on_tame');
    entity.instance.applyQueuedEvents();
    return entity;
};

/** A value's share of the spawns, by value. */
type Distribution = ReadonlyMap<number, number>;

/** Every value equally likely. */
const uniform = (values: readonly number[]): Distribution => new Map(values.map((value) => [value, 1 / values.length]));

/** One value at every spawn. */
const always = (value: number): Distribution => new Map([[value, 1]]);

/** The look components a spawn's variant scenarios read, and where the server keeps each. */
type LookAspect = 'minecraft:variant' | 'minecraft:mark_variant' | 'minecraft:color' | 'minecraft:skin_id';

/** The value a spawned entity holds for one look component. */
const lookOf = (entity: DataEntity, aspect: LookAspect): number | undefined => {
    if (aspect === 'minecraft:color' && entity.body.color !== undefined) return entity.body.color;
    const value = entity.instance.componentParams(aspect);
    const held = typeof value === 'number' ? value : field(value, 'value');
    if (typeof held === 'number') return held;
    // An entity without the component sends the actor data default, 0, which the client draws.
    return aspect === 'minecraft:variant' || aspect === 'minecraft:mark_variant' ? 0 : undefined;
};

/** How many evenly spaced rolls a variant sweep spawns with. */
const SWEEP = 60;

/**
 * The share of spawns that hold each value, over evenly spaced rolls with every draw of a spawn
 * returning the roll. Bedrock's spawn events pick a variant with one `randomize` draw, so the
 * sweep reads their weights; the Java rule is compared as a distribution.
 */
const sweepLook = (
    bedrock: string,
    aspect: LookAspect,
    biome?: string,
    how: 'spawned' | 'adult' | 'tamed' = 'spawned',
    steps = SWEEP
): Distribution => {
    const counts = new Map<number, number>();
    const current = bench(undefined, biome);
    for (let step = 0; step < steps; step++) {
        current.roll = (step + 0.5) / steps;
        const entity = how === 'tamed' ? tamedIn(current, bedrock) : spawnIn(current, bedrock);
        if (how === 'tamed') entity.instance.applyQueuedEvents();
        if (how === 'adult' && entity.instance.hasComponent('minecraft:is_baby')) {
            current.runtime.remove(entity.id, 'parity');
            continue;
        }
        const value = lookOf(entity, aspect) ?? Number.NaN;
        counts.set(value, (counts.get(value) ?? 0) + 1);
        for (const rider of current.runtime.ridersOf(entity.body))
            if (typeof rider.id === 'number') current.runtime.remove(rider.id, 'parity');
        current.runtime.remove(entity.id, 'parity');
    }
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    return new Map([...counts].map(([value, count]) => [value, count / Math.max(1, total)]));
};

/** How two distributions differ beyond the sweep's resolution, or undefined when they agree. */
const distributionDifference = (server: Distribution, java: Distribution): string | undefined => {
    const values = [...new Set([...server.keys(), ...java.keys()])].sort((left, right) => left - right);
    // Two sweep steps of slack, since a rule that skips some spawns counts fewer than SWEEP.
    const off = values.filter((value) => Math.abs((server.get(value) ?? 0) - (java.get(value) ?? 0)) > 2 / SWEEP);
    if (off.length === 0) return undefined;
    const share = (distribution: Distribution, value: number): string =>
        `${((distribution.get(value) ?? 0) * 100).toFixed(1)}%`;
    return off.map((value) => `${value}: ${share(server, value)}, Java ${share(java, value)}`).join(', ');
};

/** The Bedrock biome a Java biome maps to. */
const bedrockBiome = (javaBiome: string): string => {
    const mapped = javaIdentifierToBedrock('biome', javaBiome);
    if (mapped.kind === 'mapped' || mapped.kind === 'passthrough') return mapped.bedrock;
    throw new Error(`${javaBiome} maps to no Bedrock biome`);
};

/** Whether a Java biome is in a biome condition's `biomes`: an id, a `#tag`, or a list of ids. */
const javaBiomeMatches = (biomes: unknown, javaBiome: string): boolean => {
    const entries = Array.isArray(biomes) ? biomes : [biomes];
    return entries.some((entry) =>
        typeof entry !== 'string'
            ? false
            : entry.startsWith('#')
              ? realStack().content.tags.members('worldgen/biome', entry.slice(1)).includes(javaBiome)
              : entry === javaBiome
    );
};

/**
 * Java's spawn variant of a datapack variant registry such as `wolf_variant`: the variants whose
 * highest-priority spawn condition holds, equally likely, which is `PriorityProvider.pick`.
 * Moon brightness reads 1, the full moon of a world's first night.
 */
const javaRegistryVariants = (registry: string, javaBiome: string): ReadonlyMap<string, number> => {
    const directory = join(unpackVanillaDatapack(), 'data', 'minecraft', registry);
    const candidates: [name: string, priority: number][] = [];
    for (const file of readdirSync(directory)) {
        const parsed: unknown = JSON.parse(readFileSync(join(directory, file), 'utf8'));
        const conditions = field(parsed, 'spawn_conditions');
        let best: number | undefined;
        for (const entry of Array.isArray(conditions) ? conditions : []) {
            const condition = field(entry, 'condition');
            const kind = field(condition, 'type');
            const holds =
                condition === undefined ||
                (kind === 'minecraft:biome' && javaBiomeMatches(field(condition, 'biomes'), javaBiome)) ||
                kind === 'minecraft:moon_brightness';
            const priority = field(entry, 'priority');
            if (holds && typeof priority === 'number') best = Math.max(best ?? priority, priority);
        }
        if (best !== undefined) candidates.push([file.replace(/\.json$/, ''), best]);
    }
    const top = Math.max(...candidates.map(([, priority]) => priority));
    const picked = candidates.filter(([, priority]) => priority === top);
    return new Map(picked.map(([name]) => [name, 1 / picked.length]));
};

/** The variant value the server's group for a Java variant name holds, such as `minecraft:wolf_ashen`. */
const groupVariant = (bedrock: string, group: string, aspect: LookAspect = 'minecraft:variant'): number => {
    const params = serverTypes()
        .registry.get(bedrock)
        ?.groups.get(group)
        ?.components.find((component) => component.name === aspect)?.params;
    const found = typeof params === 'number' ? params : field(params, 'value');
    if (typeof found !== 'number') throw new Error(`${bedrock} has no ${aspect} in ${group}`);
    return found;
};

/** A Java registry's variants in one biome, as the server's variant values. */
const registryDistribution = (
    bedrock: string,
    registry: string,
    javaBiome: string,
    groupOf: (name: string) => string
): Distribution => {
    const java = new Map<number, number>();
    for (const [name, share] of javaRegistryVariants(registry, javaBiome)) {
        const value = groupVariant(bedrock, groupOf(name));
        java.set(value, (java.get(value) ?? 0) + share);
    }
    return java;
};

/** One Java rule for a look component at spawn, in each biome it is sampled in. */
interface LookRule {
    readonly aspect: LookAspect;
    /** Java biomes to spawn in; absent spawns in the bench's plains. */
    readonly biomes?: readonly string[];
    /** Whether the rule reads only grown spawns, or a tamed entity, rather than any spawn. */
    readonly how?: 'adult' | 'tamed';
    readonly java: (bedrock: string, javaBiome: string) => Distribution;
}

/** Java Rabbit.getRandomRabbitVariant: nextInt(100) against the biome's tags. */
const javaRabbit = (javaBiome: string): Distribution => {
    const tagged = (tag: string): boolean =>
        realStack().content.tags.members('worldgen/biome', tag).includes(javaBiome);
    if (tagged('minecraft:spawns_white_rabbits'))
        return new Map([
            [1, 0.8],
            [3, 0.2]
        ]);
    if (tagged('minecraft:spawns_gold_rabbits')) return always(4);
    return new Map([
        [0, 0.5],
        [5, 0.4],
        [2, 0.1]
    ]);
};

/** Java VillagerType.byBiome, as the Bedrock mark variant of the villager's biome group. */
const VILLAGER_TYPES: Readonly<Record<string, string>> = {
    'minecraft:plains': 'plains',
    'minecraft:desert': 'desert',
    'minecraft:jungle': 'jungle',
    'minecraft:savanna': 'savanna',
    'minecraft:snowy_plains': 'snow',
    'minecraft:swamp': 'swamp',
    'minecraft:taiga': 'taiga'
};

const javaVillagerType = (bedrock: string, javaBiome: string): Distribution => {
    const type = VILLAGER_TYPES[javaBiome] ?? 'plains';
    return always(type === 'plains' ? 0 : groupVariant(bedrock, `${type}_villager`, 'minecraft:mark_variant'));
};

/** Java's sheep colors in a temperate biome, SheepColorSpawnRules: dye ids by weight. */
const javaSheepColors = (): Distribution =>
    new Map([
        [15, 0.05],
        [7, 0.05],
        [8, 0.05],
        [12, 0.03],
        [0, 0.82 * (499 / 500)],
        [6, 0.82 / 500]
    ]);

const LOOK_RULES: Readonly<Record<string, readonly LookRule[]>> = {
    // Axolotl.Variant.getCommonSpawnVariant: the four common variants alike, blue only from breeding.
    'minecraft:axolotl': [{ aspect: 'minecraft:variant', java: () => uniform([0, 1, 2, 3]) }],
    'minecraft:cat': [
        // cat_variant: every variant at priority 0, all_black too under a full moon.
        {
            aspect: 'minecraft:variant',
            java: (bedrock, biome) =>
                registryDistribution(bedrock, 'cat_variant', biome, (name) =>
                    name === 'all_black'
                        ? 'minecraft:cat_black'
                        : name === 'black'
                          ? 'minecraft:cat_tuxedo'
                          : name === 'british_shorthair'
                            ? 'minecraft:cat_british'
                            : `minecraft:cat_${name}`
                )
        },
        // A tamed cat's collar starts red, Cat.DEFAULT_COLLAR_COLOR.
        { aspect: 'minecraft:color', how: 'tamed', java: () => always(14) }
    ],
    // Fox.Variant.byBiome: snow in #spawns_snow_foxes, red elsewhere.
    'minecraft:fox': [
        {
            aspect: 'minecraft:variant',
            biomes: ['minecraft:plains', 'minecraft:snowy_taiga'],
            java: (_bedrock, biome) =>
                always(
                    realStack().content.tags.members('worldgen/biome', 'minecraft:spawns_snow_foxes').includes(biome)
                        ? 1
                        : 0
                )
        }
    ],
    'minecraft:frog': [
        {
            aspect: 'minecraft:variant',
            biomes: ['minecraft:plains', 'minecraft:swamp', 'minecraft:mangrove_swamp', 'minecraft:snowy_plains'],
            java: (bedrock, biome) => registryDistribution(bedrock, 'frog_variant', biome, (name) => `${name}_frog`)
        }
    ],
    // Horse.finalizeSpawn: a Variant and a Markings, each uniform.
    'minecraft:horse': [
        { aspect: 'minecraft:variant', java: () => uniform([0, 1, 2, 3, 4, 5, 6]) },
        { aspect: 'minecraft:mark_variant', java: () => uniform([0, 1, 2, 3, 4]) }
    ],
    // Llama.finalizeSpawn: one of the four coats, uniform.
    'minecraft:llama': [{ aspect: 'minecraft:variant', java: () => uniform([0, 1, 2, 3]) }],
    'minecraft:trader_llama': [{ aspect: 'minecraft:variant', java: () => uniform([0, 1, 2, 3]) }],
    // MushroomCow spawns red with no stew effect; brown comes from lightning and breeding.
    'minecraft:mooshroom': [
        { aspect: 'minecraft:variant', java: () => always(0) },
        { aspect: 'minecraft:mark_variant', java: () => always(-1) }
    ],
    // Parrot.finalizeSpawn: one of the five variants, uniform.
    'minecraft:parrot': [{ aspect: 'minecraft:variant', java: () => uniform([0, 1, 2, 3, 4]) }],
    'minecraft:rabbit': [
        {
            aspect: 'minecraft:variant',
            biomes: ['minecraft:plains', 'minecraft:desert', 'minecraft:snowy_plains'],
            java: (_bedrock, biome) => javaRabbit(biome)
        }
    ],
    'minecraft:sheep': [{ aspect: 'minecraft:color', java: () => javaSheepColors() }],
    // A shulker spawns undyed, which Bedrock writes as variant 16.
    'minecraft:shulker': [{ aspect: 'minecraft:variant', java: () => always(16) }],
    // Pufferfish start deflated, puff state 0.
    'minecraft:pufferfish': [{ aspect: 'minecraft:variant', java: () => always(0) }],
    // A bee has not stung at spawn.
    'minecraft:bee': [{ aspect: 'minecraft:mark_variant', java: () => always(0) }],
    // Piglin.createSpawnWeapon: a crossbow (ranged, 0) or a golden sword (melee, 1) on nextFloat < 0.5.
    // A baby carries no weapon.
    'minecraft:piglin': [{ aspect: 'minecraft:variant', how: 'adult', java: () => uniform([0, 1]) }],
    // A piglin brute always carries its golden axe.
    'minecraft:piglin_brute': [{ aspect: 'minecraft:variant', java: () => always(1) }],
    // A captain only leads a patrol or a raid; a plain spawn is a raider.
    'minecraft:pillager': [{ aspect: 'minecraft:variant', java: () => always(0) }],
    'minecraft:vindicator': [{ aspect: 'minecraft:variant', java: () => always(0) }],
    'minecraft:wolf': [
        {
            aspect: 'minecraft:variant',
            biomes: [
                'minecraft:plains',
                'minecraft:taiga',
                'minecraft:snowy_taiga',
                'minecraft:old_growth_pine_taiga',
                'minecraft:old_growth_spruce_taiga',
                'minecraft:jungle',
                'minecraft:savanna',
                'minecraft:forest',
                'minecraft:grove',
                'minecraft:badlands'
            ],
            java: (bedrock, biome) =>
                registryDistribution(bedrock, 'wolf_variant', biome, (name) => `minecraft:wolf_${name}`)
        },
        // A tamed wolf's collar starts red, Wolf.DEFAULT_COLLAR_COLOR.
        { aspect: 'minecraft:color', how: 'tamed', java: () => always(14) }
    ],
    // Villager.finalizeSpawn: no profession yet, and the biome's VillagerType.
    'minecraft:villager': [
        { aspect: 'minecraft:variant', java: () => always(0) },
        {
            aspect: 'minecraft:mark_variant',
            biomes: Object.keys(VILLAGER_TYPES),
            java: javaVillagerType
        }
    ],
    // ZombieVillager.finalizeSpawn: a random profession of the fifteen, and the biome's type.
    'minecraft:zombie_villager': [
        { aspect: 'minecraft:variant', java: () => uniform([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) },
        {
            aspect: 'minecraft:mark_variant',
            biomes: Object.keys(VILLAGER_TYPES),
            java: javaVillagerType
        }
    ]
};

/**
 * The look components Bedrock keeps for a type with no Java counterpart: values that pick the
 * texture the client draws and that nothing the server runs reads. Each is compared by proving
 * nothing in the definition reads it.
 */
const CLIENT_LOOKS: Readonly<Record<string, readonly LookAspect[]>> = {
    'minecraft:husk': ['minecraft:variant'],
    'minecraft:cushion': ['minecraft:variant'],
    'minecraft:llama': ['minecraft:mark_variant'],
    'minecraft:trader_llama': ['minecraft:mark_variant'],
    'minecraft:villager': ['minecraft:skin_id'],
    'minecraft:zombie_villager': ['minecraft:skin_id']
};

/** The filter test that reads each look component. */
const LOOK_FILTER_TESTS: Readonly<Record<LookAspect, string>> = {
    'minecraft:variant': 'is_variant',
    'minecraft:mark_variant': 'is_mark_variant',
    'minecraft:color': 'is_color',
    'minecraft:skin_id': 'is_skin_id'
};

/** Java's slime and magma cube sizes, Slime.finalizeSpawn: 1 << nextInt(3) at a fresh chunk's difficulty. */
const CUBE_SIZES = [1, 2, 4] as const;

/** The scenarios over interaction, taming and identity. */
export const interactionScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'type-family',
        java: "A mob carries a Bedrock family exactly when it is in the Java entity-type tag Java's rules read for that family.",
        reference:
            'Java entity type tags undead, arthropod, illager and aquatic, which sensitive_to_smite, inverted_healing_and_harm, wither_friends, sensitive_to_bane_of_arthropods, illager_friends and sensitive_to_impaling include; families with no Java tag decide no Java rule',
        subjects: subjectsDeclaring('minecraft:type_family'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:type_family'],
        run: (subject) => {
            const families = serverTypes().spawn(subject.bedrock).families();
            const tags = realStack().content.tags;
            const differences = FAMILY_TAGS.flatMap(([tag, family, rule]) => {
                const java = tags.members('entity_type', tag).includes(subject.javaId);
                const server = families.includes(family);
                if (java === server) return [];
                return java
                    ? [`Java tags it ${tag} for ${rule}, but the server gives it no ${family} family`]
                    : [`the server puts it in the ${family} family, which Java's ${tag} leaves it out of`];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'name-tag',
        java: 'A name tag names any living entity but a player, and a named mob never despawns.',
        reference:
            'Java NameTagItem.interactLivingEntity (EntityType.canSerialize, then Mob.setPersistenceRequired) and Mob.checkDespawn',
        subjects: subjectsDeclaring('minecraft:nameable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:nameable'],
        run: (subject) => {
            const className = javaEntityClasses().get(subject.javaId);
            const javaNames =
                className !== undefined &&
                javaIsA(className, `${ENTITY}/LivingEntity`) &&
                !javaIsA(className, `${ENTITY}/player/Player`);
            const current = bench();
            const entity = spawnIn(current, subject.bedrock);
            const named = current.runtime.nameEntity(entity.id, 'Parity');
            if (named !== javaNames)
                return javaNames ? 'the server refuses the name tag' : 'the server names it, where Java refuses';
            if (!named || className === undefined || !javaIsA(className, `${ENTITY}/Mob`)) return undefined;

            // Far beyond every despawn distance, a named mob still stays.
            current.placePlayer({ x: GROUND.x + 300, y: GROUND.y, z: GROUND.z });
            tickBench(current, 20);
            return entity.removed === undefined
                ? undefined
                : `the named mob despawned (${entity.removed}) with its only player 300 blocks away`;
        }
    },
    {
        name: 'lead',
        java: "A player can put a lead on a mob exactly when Java's canBeLeashed allows it, and the lead snaps once the holder is past the mob's snap distance.",
        reference:
            'Java Leashable.canHaveALeashAttachedTo, Mob.canBeLeashed and its overrides, Leashable.tickLeash and leashSnapDistance (12, 16 for the ghasts)',
        subjects: () => {
            const declared = new Set(entitiesDeclaring('minecraft:leashable').map((subject) => subject.javaId));
            const classes = javaEntityClasses();
            return javaEntityIds().flatMap((javaId) => {
                const className = classes.get(javaId);
                const javaLeashes =
                    className !== undefined &&
                    javaIsA(className, `${ENTITY}/Leashable`) &&
                    evaluateJavaMethod(className, 'canBeLeashed', FRESH) !== 0;
                return declared.has(javaId) || javaLeashes ? (mappedEntity(javaId) ?? []) : [];
            });
        },
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:leashable'],
        run: (subject) => {
            const className = javaClassOf(subject.javaId);
            const javaLeashes = javaIsA(className, `${ENTITY}/Leashable`) && javaRule(subject.javaId, 'canBeLeashed');
            const current = bench();
            const entity = spawnIn(current, subject.bedrock);
            const leashed = current.runtime.attachLead(PLAYER, entity.id);
            if (leashed !== javaLeashes)
                return javaLeashes ? 'the server refuses a lead Java accepts' : 'the server takes a lead Java refuses';
            if (!leashed) return undefined;

            const snap = evaluateJavaMethod(className, 'leashSnapDistance', FRESH);
            current.placePlayer({ x: entity.position.x + snap - 2, y: entity.position.y, z: entity.position.z });
            tickBench(current, 1);
            if (!leashedTo(current, entity)) return `the lead snapped ${snap - 2} blocks away, inside Java's ${snap}`;
            current.placePlayer({ x: entity.position.x + snap + 2, y: entity.position.y, z: entity.position.z });
            tickBench(current, 1);
            return leashedTo(current, entity)
                ? `the lead holds ${snap + 2} blocks away, past Java's snap distance of ${snap}`
                : undefined;
        }
    },
    {
        name: 'lead-holder',
        java: "A player's leashed mobs move onto a leashable, adult mob the player sneak-uses, which then holds them.",
        reference:
            'Java Entity.interact (isSecondaryUseActive, Leashable.leashableInArea, canHaveALeashAttachedTo, setLeashedTo)',
        subjects: subjectsDeclaring('minecraft:leashable_to'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:leashable_to'],
        run: (subject) => {
            const className = javaClassOf(subject.javaId);
            const javaHolds = javaIsA(className, `${ENTITY}/Leashable`) && javaRule(subject.javaId, 'canBeLeashed');
            const current = bench();
            const holder = spawnIn(current, subject.bedrock);
            // Java's Entity.interact refuses a baby holder, so a holder that spawned a baby is compared as one.
            const javaTakes = javaHolds && !holder.instance.hasComponent('minecraft:is_baby');
            const led = spawnIn(current, 'minecraft:cow', { x: GROUND.x + 1, y: GROUND.y, z: GROUND.z });
            current.runtime.attachLead(PLAYER, led.id);
            const moved = current.runtime.transferLeashes(PLAYER, holder.id);
            const holds = current.runtime.leashHolderIdOf(led.id) === holder.id;
            if (moved !== holds) return 'the server reports a move it did not make';
            if (holds === javaTakes) return undefined;
            return javaTakes
                ? "the server does not move the player's lead onto it"
                : "the server moves the player's lead onto it, where Java refuses";
        }
    },
    {
        name: 'no-balloon',
        java: 'Java has no balloons, so nothing ties one to a mob.',
        reference: 'Java 26.3 registers no balloon item; balloons are a Bedrock Education feature',
        subjects: subjectsDeclaring('minecraft:balloonable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:balloonable'],
        run: (subject) => {
            const content = realStack().content;
            if (content.items.types.get('minecraft:balloon') !== undefined)
                return 'the server registers a balloon item for it to be tied to';
            const hooks = content.entities.components.hooksOf('minecraft:balloonable');
            if (hooks.size > 0) return `the server runs minecraft:balloonable (${[...hooks].join(', ')})`;
            return content.entities.registry.get(subject.bedrock) === undefined
                ? `the server declares no ${subject.bedrock}`
                : undefined;
        }
    },
    {
        name: 'seats',
        java: 'A vehicle carries as many riders as Java seats on it in play: what canAddPassenger admits, capped by how many players its mobInteract seats: two in a boat or raft, one in a chest boat, four on a happy ghast, two on a camel, three baby piglins stacked on a hoglin, one elsewhere.',
        reference:
            'Java Entity.canAddPassenger and its overrides in AbstractBoat, AbstractChestBoat, Camel, HappyGhast, Strider and AbstractNautilus; Camel.mobInteract (getPassengers().size() < 2 before doPlayerRide; RideCommand forces past canAddPassenger, and no vanilla mob mounts a camel unforced); Piglin.startRiding (getTopPassenger(hoglin, 3)); issue #3120',
        subjects: subjectsDeclaring('minecraft:rideable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:rideable'],
        run: (subject) => {
            if (subject.javaId === 'minecraft:player') {
                // Java seats no entity on a player; Bedrock's two seats are the shoulder parrots,
                // which Java keeps as shoulder data instead.
                return 'the server seats riders on a player, where Java carries shoulder parrots as data';
            }
            const java = javaSeats(subject.javaId);
            const server = serverSeats(subject.bedrock);
            return java === server ? undefined : `the server seats ${server}, Java ${java}`;
        },
        classify: (subject) =>
            subject.javaId === 'minecraft:player'
                ? {
                      kind: 'intentional',
                      reason: "Bedrock seats a player's shoulder parrots as riders and draws them from its own seat data; Java keeps them as shoulder entity data. Rendered presentation, category 1 of docs/data-driven/parity.md."
                  }
                : undefined
    },
    {
        name: 'spawn-egg-offspring',
        java: "A mob's own spawn egg used on it makes a baby of it, when the mob can be a baby.",
        reference:
            'Java SpawnEggItem.spawnOffspringFromSpawnEgg (setBaby(true), then refuses when isBaby is false); issue #3121',
        subjects: subjectsDeclaring('minecraft:spawn_egg_interaction'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:spawn_egg_interaction'],
        run: (subject) => {
            const javaBaby = javaCanBeBaby(subject.javaId);
            const current = bench();
            const entity = spawnIn(current, subject.bedrock);
            const before = new Set([...current.runtime.entities()].map((spawned) => spawned.id));
            const egg = spawnEggOf(subject.javaId);
            const result = current.runtime.interactWithItem(entity.id, PLAYER, egg, holding(egg));
            const offspring = [...current.runtime.entities()].filter((spawned) => !before.has(spawned.id));
            // Bedrock writes a baby as is_baby, or as a growing ageable such as the small sulfur cube.
            const baby = offspring.some(
                (child) =>
                    child.instance.hasComponent('minecraft:is_baby') || child.instance.hasComponent('minecraft:ageable')
            );
            if (javaBaby && !(result.accepted && baby))
                return result.accepted
                    ? 'the egg makes an adult, where Java makes a baby'
                    : 'the server ignores its own spawn egg, where Java makes a baby';
            if (!javaBaby && result.accepted && offspring.length > 0)
                return 'the egg makes an offspring, where Java refuses because the mob cannot be a baby';
            return undefined;
        }
    },
    {
        name: 'held-item-interaction',
        java: 'A mob takes, converts or ignores the item a player uses on it the way its Java mobInteract does.',
        reference:
            'Java mobInteract of AbstractCow, MushroomCow, Goat, Sheep, SnowGolem, Bogged, CopperGolem, Creeper, IronGolem, Armadillo, Allay, Bee, ZombieVillager, Pig, Strider, Camel, AbstractHorse, Llama, AbstractNautilus, SulfurCube, Piglin and Wolf, Mob.interact for saddles, carpets and harnesses, DyeItem.interactLivingEntity, and MinecartTNT, which has no interact; issue #3118',
        subjects: subjectsDeclaring('minecraft:interact'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:interact'],
        run: (subject) => {
            const probes: InteractProbe[] = [...(INTERACT_PROBES[subject.javaId] ?? [])];
            if (subject.javaId !== 'minecraft:allay')
                probes.push({
                    item: 'minecraft:stick',
                    java: 'reject',
                    why: 'no Java mob but the allay takes a stick'
                });
            const differences = probes.flatMap((probe) => {
                const current = bench();
                const entity = adultIn(current, subject.bedrock);
                const item = probe.via === 'dye' ? `${probe.item} dye` : probeItem(probe.item);
                const server =
                    probe.via === 'dye'
                        ? current.runtime.dyeEntity(entity.id, probe.item)
                            ? 'accept'
                            : 'reject'
                        : serverInteract(current, entity, item);
                const agrees =
                    probe.java === 'accept' ? server !== 'reject' : withNamespace(server) === withNamespace(probe.java);
                return agrees ? [] : [`${item}: the server answers ${server}, Java ${probe.java} (${probe.why})`];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'tame-chance',
        java: 'Feeding a taming item tames on a one in n roll (three for the wolf, cat and nautili, ten for the parrot), and only the items Java names start a roll.',
        reference:
            'Java Wolf.tryToTame, Cat.tryToTame, Parrot.mobInteract and AbstractNautilus.tryToTame (RandomSource.nextInt bounds), with items Items.BONE and the cat_food, parrot_food and nautilus_taming_items tags; issue #3117',
        subjects: subjectsDeclaring('minecraft:tameable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:tameable'],
        run: (subject) => {
            const rule = TAMING[subject.javaId];
            if (rule === undefined) return `no Java taming rule is recorded for ${subject.javaId}`;
            const [bound] = javaRandomBounds(rule.className, rule.method);
            if (bound === undefined) return `${rule.className}.${rule.method} rolls no nextInt`;
            const javaItems = new Set(rule.items());
            const serverItems = listedItems(subject.bedrock, 'minecraft:tameable', 'tame_items');
            const differences: string[] = [];
            for (const item of javaItems) {
                if (!tamesAt(subject.bedrock, item, 0)) differences.push(`${item} never tames it`);
                else if (!serverItems.has(item)) differences.push(`${item} tames it only through another component`);
            }
            for (const item of serverItems) {
                if (!javaItems.has(item) && tamesAt(subject.bedrock, item, 0))
                    differences.push(`${item} tames it, which Java does not accept`);
            }
            const [item] = javaItems;
            if (item !== undefined) {
                const chance = 1 / bound;
                if (!tamesAt(subject.bedrock, item, chance - 0.001))
                    differences.push(`a roll of ${(chance - 0.001).toFixed(4)} fails, inside Java's one in ${bound}`);
                if (tamesAt(subject.bedrock, item, chance + 0.001))
                    differences.push(`a roll of ${(chance + 0.001).toFixed(4)} tames, past Java's one in ${bound}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'sit-command',
        java: "An owner's empty-handed use toggles a tamed wolf, cat or parrot between sitting and standing, and a parrot only from the ground; an ocelot can never be tamed, so nothing sits it on command.",
        reference:
            'Java TamableAnimal.setOrderedToSit, called from Wolf.mobInteract, Cat.mobInteract and Parrot.mobInteract (not while isFlying); Ocelot extends Animal and Ocelot.mobInteract only sets trust; issue #3113',
        subjects: subjectsDeclaring('minecraft:sittable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:sittable'],
        run: (subject) => {
            const javaSits = javaIsA(javaClassOf(subject.javaId), `${ENTITY}/TamableAnimal`);
            const current = bench();
            const empty = (entity: DataEntity): void => {
                current.runtime.interactWithItem(entity.id, PLAYER, 'minecraft:air', holding('minecraft:air'), {
                    identifier: 'minecraft:air',
                    count: 0
                });
            };
            if (!javaSits) {
                // Every item the definition tames or wins trust with, on a roll that always succeeds.
                const entity = spawnIn(current, subject.bedrock);
                current.roll = 0;
                const items = [
                    ...listedItems(subject.bedrock, 'minecraft:tameable', 'tame_items'),
                    ...listedItems(subject.bedrock, 'minecraft:trusting', 'trust_items')
                ];
                for (const item of items) current.runtime.interactWithItem(entity.id, PLAYER, item, holding(item));
                entity.instance.applyQueuedEvents();
                empty(entity);
                tickBench(current, 1);
                if (entity.body.owner !== undefined) return 'a player tames it, which Java never allows';
                return entity.body.sitting ? 'it sits on command, which Java never does' : undefined;
            }
            const entity = tamedIn(current, subject.bedrock);
            // A parrot settles to the ground first; Java's toggle waits while it flies.
            tickBench(current, 2);
            empty(entity);
            if (!entity.body.sitting) return "the owner's empty hand does not sit it down";
            empty(entity);
            if (entity.body.sitting) return "the owner's second use does not stand it back up";
            current.runtime.interactWithItem(entity.id, PLAYER + 1, 'minecraft:air', holding('minecraft:air'), {
                identifier: 'minecraft:air',
                count: 0
            });
            return entity.body.sitting ? 'a stranger sits it down, where Java answers only its owner' : undefined;
        }
    },
    {
        name: 'horse-temper',
        java: "Feeding an untamed horse or llama raises its temper by the amount Java's handleEating gives that food, up to getMaxTemper; each buck with a player aboard tames it when nextInt(maxTemper) falls below the temper, and otherwise adds 5.",
        reference:
            'Java AbstractHorse.handleEating and Llama.handleEating (the int passed to modifyTemper), AbstractHorse.getMaxTemper (100) and Llama.getMaxTemper (30), RunAroundLikeCrazyGoal.tick, and the horse_food, zombie_horse_food and llama_food tags; issue #3114',
        subjects: subjectsDeclaring('minecraft:tamemount'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:tamemount'],
        run: (subject) => {
            const tag = HORSE_FOOD[subject.javaId];
            if (tag === undefined) return `no Java food tag is recorded for ${subject.javaId}`;
            const className = javaClassOf(subject.javaId);
            const eating = javaResolveMethod(className, 'handleEating');
            if (eating === undefined) return `${className} eats nothing`;
            const tempers = javaItemBranchValues(eating.owner, 'handleEating', 'modifyTemper');
            const maxTemper = evaluateJavaMethod(className, 'getMaxTemper', FRESH);
            const differences: string[] = [];

            const temperAfter = (item: string, feedings: number): number | undefined => {
                const current = bench();
                const entity = adultIn(current, subject.bedrock);
                for (let feeding = 0; feeding < feedings; feeding++)
                    current.runtime.interactWithItem(entity.id, PLAYER, item, holding(item));
                return temperOfMount(entity.instance);
            };
            const foods = realStack()
                .content.tags.members('item', tag)
                .map((javaItem) => [javaItem, tempers.get(javaItem.slice('minecraft:'.length)) ?? 0] as const);
            for (const [javaItem, java] of foods) {
                const item = bedrockItem(javaItem);
                const server = temperAfter(item, 1);
                if (server !== java) differences.push(`${item} raises its temper to ${String(server)}, Java ${java}`);
            }
            // Feeding past the maximum stops there.
            const [richest] = [...foods].sort((left, right) => right[1] - left[1]);
            if (richest !== undefined && richest[1] > 0) {
                const feedings = Math.ceil(maxTemper / richest[1]) + 2;
                const server = temperAfter(bedrockItem(richest[0]), feedings);
                if (server !== maxTemper)
                    differences.push(`its temper tops out at ${String(server)}, Java ${maxTemper}`);
            }

            // A buck with a player aboard: Java tames when nextInt(maxTemper) < temper, else adds 5.
            const [buckTemper] = javaConstantsPassedTo(
                `${ENTITY}/ai/goal/RunAroundLikeCrazyGoal`,
                'tick',
                `${ENTITY}/animal/equine/AbstractHorse.modifyTemper`
            );
            const current = bench();
            const entity = adultIn(current, subject.bedrock);
            current.roll = 0;
            const first = buckMount(entity.instance);
            if (first !== false || temperOfMount(entity.instance) !== buckTemper)
                differences.push(
                    `a buck at temper 0 ${first === true ? 'tames it' : 'leaves it'} at temper ${String(temperOfMount(entity.instance))}, Java throws the rider and adds ${String(buckTemper)}`
                );
            current.roll = ((buckTemper ?? 0) - 0.5) / maxTemper;
            if (buckMount(entity.instance) !== true)
                differences.push(`a draw of ${(buckTemper ?? 1) - 1} under its temper does not tame it`);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'ocelot-trust',
        java: "Feeding an ocelot an item of Java's ocelot_food tag wins its trust on a one in three roll and eats the food either way.",
        reference:
            'Java Ocelot.mobInteract (ocelot_food tag, RandomSource.nextInt(3), setTrusting); issue #3115 and #3117',
        subjects: subjectsDeclaring('minecraft:trusting'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:trusting'],
        run: (subject) => {
            const [bound] = javaRandomBounds(`${ENTITY}/animal/feline/Ocelot`, 'mobInteract');
            if (bound === undefined) return 'Ocelot.mobInteract rolls no nextInt';
            const trustsAt = (item: string, roll: number): { eaten: boolean; trusts: boolean } => {
                const current = bench();
                const entity = adultIn(current, subject.bedrock);
                current.roll = roll;
                const eaten = current.runtime.interactWithItem(entity.id, PLAYER, item, holding(item)).accepted;
                entity.instance.applyQueuedEvents();
                return { eaten, trusts: !entity.instance.hasComponent('minecraft:trusting') };
            };
            const differences: string[] = [];
            const foods = itemTag('minecraft:ocelot_food');
            for (const item of foods) {
                const won = trustsAt(item, 1 / bound - 0.001);
                if (!won.trusts) differences.push(`${item} at a roll inside one in ${bound} wins no trust`);
                const lost = trustsAt(item, 1 / bound + 0.001);
                if (lost.trusts) differences.push(`${item} at a roll past one in ${bound} wins its trust`);
                if (!lost.eaten) differences.push(`a failed roll leaves ${item} uneaten, where Java eats it`);
            }
            if (trustsAt('minecraft:beef', 0).eaten) differences.push('it eats beef, which ocelot_food leaves out');
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'fox-trust',
        java: 'A fox born of two parents trusts the players who fed each parent, and nobody else.',
        reference: 'Java Fox.FoxBreedGoal.breed (addTrustedEntity for each parent loveCause), Fox.trusts; issue #3115',
        subjects: subjectsDeclaring('minecraft:trust'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:trust'],
        run: (subject) => {
            const current = bench();
            const first = adultIn(current, subject.bedrock);
            const second = adultIn(current, subject.bedrock);
            const [food] = itemTag('minecraft:fox_food');
            if (food === undefined) return 'Java names no fox_food';
            current.runtime.interactWithItem(first.id, PLAYER, food, holding(food));
            current.runtime.interactWithItem(second.id, PLAYER, food, holding(food));
            const mate = current.runtime.mobById(second.id);
            if (mate === undefined) return 'the second fox has no goal view';
            const before = new Set([...current.runtime.entities()].map((entity) => entity.id));
            current.runtime.breedWith(first.body, mate);
            const kit = [...current.runtime.entities()].find((entity) => !before.has(entity.id));
            if (kit === undefined) return 'two fed foxes breed no kit';
            const trusts = kit.instance.filterContext().self.trusts;
            if (trusts?.({ id: () => PLAYER }) !== true) return 'the kit does not trust the player who fed its parents';
            return trusts({ id: () => PLAYER + 1 }) ? 'the kit trusts a player who fed neither parent' : undefined;
        }
    },
    {
        name: 'dolphin-bribe',
        java: "A grown dolphin eats any item of Java's fishes tag and holds the fish until its swim to treasure ends; it eats nothing else.",
        reference:
            'Java Dolphin.mobInteract (ItemTags.FISHES, setGotFish), DolphinSwimToTreasureGoal.canUse (gotFish) and stop (setGotFish(false)); issue #3115',
        subjects: subjectsDeclaring('minecraft:bribeable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:bribeable'],
        run: (subject) => {
            const differences: string[] = [];
            for (const item of itemTag('minecraft:fishes')) {
                const current = bench();
                const entity = adultIn(current, subject.bedrock);
                const eaten = current.runtime.interactWithItem(entity.id, PLAYER, item, holding(item)).accepted;
                if (!eaten || isBribed(entity.instance) !== true) differences.push(`${item} does not bribe it`);
                else {
                    spendBribe(entity.instance);
                    if (isBribed(entity.instance) !== false) differences.push('a finished swim keeps the bribe');
                }
            }
            const current = bench();
            const entity = adultIn(current, subject.bedrock);
            current.runtime.interactWithItem(entity.id, PLAYER, 'minecraft:beef', holding('minecraft:beef'));
            if (isBribed(entity.instance) !== false) differences.push('beef bribes it, which fishes leaves out');
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'panda-gift',
        java: 'A panda takes bamboo from a player and ignores cake, which it only eats off the ground.',
        reference: 'Java Panda.mobInteract (isFood: the panda_food tag) and the panda_eats_from_ground tag',
        subjects: subjectsDeclaring('minecraft:giveable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:giveable'],
        run: (subject) => {
            const differences = itemTag('minecraft:panda_eats_from_ground').flatMap((item) => {
                const javaTakes = itemTag('minecraft:panda_food').includes(item);
                const current = bench();
                const entity = adultIn(current, subject.bedrock);
                const takes = serverInteract(current, entity, item) !== 'reject';
                if (takes === javaTakes) return [];
                return [
                    javaTakes ? `it refuses ${item} from a hand` : `it takes ${item} from a hand, which Java refuses`
                ];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'jockey-riders',
        java: 'A jockey arrives with the rider types Java seats on it: a skeleton on a spider or cave spider, a zombified piglin or a baby strider on a strider, a zombie on a zombie horse, a husk and a parched on a camel husk, and a pillager, evoker or vindicator on a raid ravager.',
        reference:
            'Java Spider.finalizeSpawn, Strider.finalizeSpawn and spawnJockey, ZombieHorse.finalizeSpawn, Husk.finalizeSpawn (the camel husk and its parched) and Raid (the ravager riders): the EntityTypes each creates and seats; issues #3116 and #3164',
        subjects: subjectsDeclaring('minecraft:addrider'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:addrider'],
        run: (subject) => {
            const source = JOCKEY_SOURCES[subject.javaId];
            if (source === undefined) return `no Java jockey rule is recorded for ${subject.javaId}`;
            const java = new Set([...javaRiderTypes(source, subject.javaId)].map(bedrockEntity));
            const declared = componentValues(subject.bedrock, 'minecraft:addrider').flatMap((value) => {
                const riders = field(value, 'riders');
                return (Array.isArray(riders) ? riders : [value]).flatMap((rider) =>
                    stringList(field(rider, 'entity_type'))
                );
            });
            const server = new Set(declared.map(bedrockEntity));
            const differences: string[] = [];
            const missing = [...java].filter((rider) => !server.has(rider));
            const extra = [...server].filter((rider) => !java.has(rider));
            if (missing.length > 0) differences.push(`it never carries ${missing.join(', ')}`);
            if (extra.length > 0) differences.push(`it carries ${extra.join(', ')}, which Java never seats on it`);

            // The spawn the server's own rules give a jockey must arrive with its riders seated.
            const current = bench(NIGHT);
            current.roll = source.roll;
            const vehicle = current.runtime.spawn(subject.bedrock, GROUND, {
                ...(source.event === undefined ? {} : { event: source.event })
            });
            if (vehicle === undefined) return `the server spawns no ${subject.bedrock}`;
            const seated = current.runtime
                .ridersOf(vehicle.body)
                .map((rider) => bedrockEntity(rider.identifier?.() ?? 'unknown'));
            if (seated.length === 0)
                differences.push(`its jockey spawn (${source.event ?? 'a natural spawn'}) seats no rider`);
            for (const rider of seated)
                if (!java.has(rider)) differences.push(`its jockey spawn seats ${rider}, which Java never seats on it`);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'jockey-chance',
        java: 'A spider or cave spider spawns a skeleton jockey on random.nextInt(100) == 0 whatever the time and biome, and an adult strider spawns a zombified piglin jockey on nextInt(30) == 0 and otherwise a baby strider jockey on nextInt(10) == 0.',
        reference: 'Java Spider.finalizeSpawn and Strider.finalizeSpawn (RandomSource.nextInt bounds); issue #3164',
        subjects: () =>
            entitiesDeclaring('minecraft:addrider').filter((subject) => JOCKEY_CHANCES[subject.javaId] !== undefined),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:addrider'],
        run: (subject) => {
            const chance = JOCKEY_CHANCES[subject.javaId];
            if (chance === undefined) return `no Java jockey chance is recorded for ${subject.javaId}`;
            const bounds = javaRandomBounds(chance.className, 'finalizeSpawn');
            const differences: string[] = [];
            for (const [dayTime, when] of [
                [NOON, 'at noon'],
                [NIGHT, 'at night']
            ] as const) {
                // Every draw of a spawn returns the roll, which Bedrock's single randomize reads once.
                const share = new Map<string, number>();
                let adults = 0;
                const steps = 400;
                const current = bench(dayTime);
                for (let step = 0; step < steps; step++) {
                    current.roll = (step + 0.5) / steps;
                    const vehicle = current.runtime.spawn(subject.bedrock, GROUND);
                    if (vehicle === undefined) continue;
                    const riders = current.runtime.ridersOf(vehicle.body);
                    if (!vehicle.instance.hasComponent('minecraft:is_baby')) {
                        adults += 1;
                        for (const rider of riders) {
                            const type = bedrockEntity(rider.identifier?.() ?? 'unknown');
                            share.set(type, (share.get(type) ?? 0) + 1);
                        }
                    }
                    for (const rider of riders)
                        if (typeof rider.id === 'number') current.runtime.remove(rider.id, 'parity');
                    current.runtime.remove(vehicle.id, 'parity');
                }
                for (const [rider, java] of chance.java(bounds)) {
                    const server = adults === 0 ? 0 : (share.get(rider) ?? 0) / adults;
                    if (Math.abs(server - java) > 0.0025)
                        differences.push(
                            `${when} ${(server * 100).toFixed(2)}% of adults carry ${rider}, Java ${(java * 100).toFixed(2)}%`
                        );
                }
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'genes',
        java: "A goat spawns screaming when nextDouble() is below 0.02, a panda's genes follow Panda.Gene.getRandom's nextInt(16) table, and a cub takes one gene from each parent.",
        reference:
            'Java Goat.finalizeSpawn (0.02), Panda.Gene.getRandom (0 lazy, 1 worried, 2 playful, 4 aggressive, below 9 weak, below 11 brown, else normal), Panda.setGeneFromParents and Panda.getVariantFromGenes; issue #3119',
        subjects: subjectsDeclaring('minecraft:genetics'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:genetics', 'minecraft:variant'],
        run: (subject) => {
            const differences: string[] = [];
            const spawnAt = (roll: number): DataEntity => {
                const current = bench();
                current.roll = roll;
                return spawnIn(current, subject.bedrock);
            };
            if (subject.javaId === 'minecraft:goat') {
                for (const roll of [0.005, 0.015, 0.025, 0.5]) {
                    const java = roll < 0.02;
                    const server = spawnAt(roll).instance.activeComponentGroups().includes('goat_screamer');
                    if (java !== server)
                        differences.push(
                            `a roll of ${roll} spawns ${server ? 'a screamer' : 'a plain goat'}, Java ${java ? 'a screamer' : 'a plain goat'}`
                        );
                }
            } else if (subject.javaId === 'minecraft:panda') {
                // Every draw of one spawn returns the same roll, so its main and hidden genes match.
                for (let draw = 0; draw < 16; draw++) {
                    const java = javaPandaGene(draw);
                    const variant = spawnAt((draw + 0.5) / 16).instance.componentParams('minecraft:variant');
                    const server = typeof variant === 'number' ? BEDROCK_PANDA_VARIANTS[variant] : 'none';
                    if (server !== java)
                        differences.push(`a draw of ${draw} makes a ${server ?? 'unknown'} panda, Java ${java}`);
                }
                // A cub's genes come from its parents: Panda.setGeneFromParents, then getVariantFromGenes.
                for (const [father, mother, roll] of PANDA_CROSSES) {
                    const current = bench();
                    current.roll = ((PANDA_GENE_DRAWS[father] ?? 0) + 0.5) / 16;
                    const dad = spawnIn(current, subject.bedrock);
                    current.roll = ((PANDA_GENE_DRAWS[mother] ?? 0) + 0.5) / 16;
                    const mom = spawnIn(current, subject.bedrock);
                    current.roll = roll;
                    const cub = current.runtime.spawn(subject.bedrock, GROUND, { cause: 'born', parents: [dad, mom] });
                    cub?.instance.applyQueuedEvents();
                    const variant = cub?.instance.componentParams('minecraft:variant');
                    const server = typeof variant === 'number' ? BEDROCK_PANDA_VARIANTS[variant] : 'none';
                    const java = javaPandaCub(father, mother, roll);
                    if (server !== java)
                        differences.push(
                            `a ${father} and a ${mother} panda at a roll of ${roll} have a ${server ?? 'unknown'} cub, Java ${java}`
                        );
                }
            } else differences.push(`no Java gene rule is recorded for ${subject.javaId}`);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'variant-at-spawn',
        java: "A spawned mob's variant, markings and colors follow Java's spawn rule for its type: a datapack variant registry's biome conditions, a uniform pick, a biome table, or a fixed starting value.",
        reference:
            'Java wolf_variant, cat_variant and frog_variant spawn_conditions; Axolotl, Horse, Llama, Parrot, Fox, Rabbit, Villager, ZombieVillager, MushroomCow, Shulker, Pufferfish, Bee and Piglin finalizeSpawn; SheepColorSpawnRules; Cat and Wolf DEFAULT_COLLAR_COLOR; issue #3172',
        subjects: () =>
            javaEntityIds().flatMap((javaId) => (LOOK_RULES[javaId] === undefined ? [] : (mappedEntity(javaId) ?? []))),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => [...new Set((LOOK_RULES[subject.javaId] ?? []).map((rule) => rule.aspect))],
        run: (subject) => {
            const differences = (LOOK_RULES[subject.javaId] ?? []).flatMap((rule) =>
                (rule.biomes ?? ['minecraft:plains']).flatMap((javaBiome) => {
                    const biome = rule.biomes === undefined ? undefined : bedrockBiome(javaBiome);
                    const java = rule.java(subject.bedrock, javaBiome);
                    // A fixed Java value needs only a few rolls to show any spread.
                    const steps = java.size === 1 ? 8 : SWEEP;
                    const server = sweepLook(subject.bedrock, rule.aspect, biome, rule.how, steps);
                    const difference = distributionDifference(server, java);
                    return difference === undefined
                        ? []
                        : [`${rule.aspect}${rule.biomes === undefined ? '' : ` in ${javaBiome}`}: ${difference}`];
                })
            );
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'client-look',
        java: 'Java has no counterpart to these Bedrock look values: each picks the texture the client draws. Every group that sets one sets nothing else, and nothing outside such groups reads it, so all it can change is the picture.',
        reference:
            "Java Husk, Cushion, Llama, Villager and ZombieVillager hold no such field; Bedrock writes them for the resource pack, and a villager reads its zombie form's skin only to keep the same face. Category 1 of docs/data-driven/parity.md covers what the client draws",
        subjects: () =>
            javaEntityIds().flatMap((javaId) =>
                CLIENT_LOOKS[javaId] === undefined ? [] : (mappedEntity(javaId) ?? [])
            ),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => CLIENT_LOOKS[subject.javaId] ?? [],
        run: (subject) => {
            const type = serverTypes().registry.get(subject.bedrock);
            const differences: string[] = [];
            for (const aspect of CLIENT_LOOKS[subject.javaId] ?? []) {
                const lookGroups = new Set<string>();
                for (const group of type?.groups.values() ?? []) {
                    if (!group.components.some((component) => component.name === aspect)) continue;
                    lookGroups.add(group.name);
                    const others = group.components.filter((component) => component.name !== aspect);
                    if (others.length > 0)
                        differences.push(
                            `${group.name} sets ${others.map((component) => component.name).join(', ')} with ${aspect}`
                        );
                }
                // A filter that reads the value may only pick another group that sets it.
                for (const [name, event] of type?.entity.events ?? []) {
                    const text = JSON.stringify(event, (_key, value: unknown) =>
                        value instanceof Map ? Object.fromEntries(value) : value
                    );
                    if (!text.includes(`"${LOOK_FILTER_TESTS[aspect]}"`)) continue;
                    const added = [...text.matchAll(/"component_groups":\[([^\]]*)\]/g)].flatMap((match) =>
                        [...(match[1] ?? '').matchAll(/"([^"]+)"/g)].map((group) => group[1] ?? '')
                    );
                    const acting = added.filter((group) => !lookGroups.has(group));
                    if (acting.length > 0)
                        differences.push(`${name} reads ${aspect} and may add ${[...new Set(acting)].join(', ')}`);
                }
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'cube-size',
        java: 'A slime or magma cube spawns at size 1 << nextInt(3), each size alike, with size squared health.',
        reference:
            'Java Slime.finalizeSpawn (1 << random.nextInt(3), the special multiplier 0 in a fresh chunk) and Slime.setSize (MAX_HEALTH size * size), which MagmaCube inherits; ADR 0001 keeps the per-size values Bedrock writes as component groups',
        subjects: () => ['minecraft:slime', 'minecraft:magma_cube'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:variant'],
        run: (subject) => {
            const differences: string[] = [];
            const sizes = sweepLook(subject.bedrock, 'minecraft:variant');
            const difference = distributionDifference(sizes, uniform([...CUBE_SIZES]));
            if (difference !== undefined) differences.push(`sizes ${difference}`);
            const current = bench();
            for (let step = 0; step < SWEEP; step += 8) {
                current.roll = (step + 0.5) / SWEEP;
                const cube = spawnIn(current, subject.bedrock);
                const size = lookOf(cube, 'minecraft:variant');
                const health = cube.instance.attributes.get('health')?.max;
                if (size !== undefined && health !== size * size)
                    differences.push(`a size ${size} cube has ${String(health)} health, Java ${size * size}`);
                current.runtime.remove(cube.id, 'parity');
            }
            return differences.length === 0 ? undefined : [...new Set(differences)].join('; ');
        }
    }
];
