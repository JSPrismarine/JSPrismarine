import type { EntityInstance } from '@jsprismarine/entities/entityInstance';
import type { FilterEntityView } from '@jsprismarine/entities/filterContext';
import { isRideableParams } from '@jsprismarine/entities/riding';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import type { ContentEntity, ContentPosition } from '@jsprismarine/prismarine/content/world/adapter';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { FLOOR_Y, TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import type { JavaEntityState } from '../javaEntityClasses.ts';
import {
    evaluateJavaMethod,
    javaEntityClasses,
    javaIsA,
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
const bench = (): Bench => {
    const world = new TestEntityWorld();
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

/** How many passengers Java's `canAddPassenger` lets an entity carry, counting up from none. */
const javaSeats = (javaId: string): number => {
    const className = javaClassOf(javaId);
    let seats = 0;
    while (seats < 8 && evaluateJavaMethod(className, 'canAddPassenger', { ...FRESH, passengers: seats }) !== 0)
        seats += 1;
    return seats;
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
    readonly item: string;
    /** `accept` means Java uses the item; a string is the item Java hands back; `reject` means Java ignores it. */
    readonly java: 'accept' | 'reject' | string;
    readonly why: string;
}

/**
 * What Java's `mobInteract` (or `Entity.interact`) does with one item for each mob whose server
 * definition declares `minecraft:interact`, read from the item checks in each class's method in
 * the 26.3 jar. Every subject is probed with a stick too, which no Java mob but the allay takes.
 */
const INTERACT_PROBES: Readonly<Record<string, readonly InteractProbe[]>> = {
    'minecraft:allay': [{ item: 'minecraft:diamond', java: 'accept', why: 'Allay.mobInteract hands it the item' }],
    'minecraft:armadillo': [{ item: 'minecraft:brush', java: 'accept', why: 'Armadillo.brushOffScute' }],
    'minecraft:bogged': [{ item: 'minecraft:shears', java: 'accept', why: 'Bogged.shear' }],
    'minecraft:camel': [{ item: 'minecraft:saddle', java: 'accept', why: 'an adult camel equips a saddle' }],
    'minecraft:copper_golem': [
        { item: 'minecraft:honeycomb', java: 'accept', why: 'CopperGolem waxes with honeycomb' }
    ],
    'minecraft:cow': [{ item: 'minecraft:bucket', java: 'minecraft:milk_bucket', why: 'AbstractCow milks an adult' }],
    'minecraft:creeper': [
        { item: 'minecraft:flint_and_steel', java: 'accept', why: 'Creeper ignites from #creeper_igniters' }
    ],
    'minecraft:donkey': [{ item: 'minecraft:saddle', java: 'reject', why: 'an untamed horse cannot use the slot' }],
    'minecraft:goat': [{ item: 'minecraft:bucket', java: 'minecraft:milk_bucket', why: 'Goat milks an adult' }],
    'minecraft:horse': [{ item: 'minecraft:saddle', java: 'reject', why: 'an untamed horse cannot use the slot' }],
    'minecraft:iron_golem': [
        { item: 'minecraft:iron_ingot', java: 'reject', why: 'IronGolem only heals when hurt, and a fresh one is not' }
    ],
    'minecraft:llama': [
        { item: 'minecraft:white_carpet', java: 'reject', why: 'an untamed llama cannot wear a carpet' }
    ],
    'minecraft:mooshroom': [
        { item: 'minecraft:bucket', java: 'minecraft:milk_bucket', why: 'AbstractCow milks an adult' },
        { item: 'minecraft:bowl', java: 'minecraft:mushroom_stew', why: 'MushroomCow fills a bowl' },
        { item: 'minecraft:shears', java: 'accept', why: 'MushroomCow.shear' }
    ],
    'minecraft:mule': [{ item: 'minecraft:saddle', java: 'reject', why: 'an untamed horse cannot use the slot' }],
    'minecraft:pig': [{ item: 'minecraft:saddle', java: 'accept', why: 'an adult pig equips a saddle' }],
    'minecraft:piglin': [{ item: 'minecraft:gold_ingot', java: 'accept', why: 'PiglinAi admires a loved item' }],
    'minecraft:sheep': [{ item: 'minecraft:shears', java: 'accept', why: 'Sheep.shear' }],
    'minecraft:shulker': [{ item: 'minecraft:red_dye', java: 'reject', why: 'Shulker has no mobInteract' }],
    'minecraft:snow_golem': [{ item: 'minecraft:shears', java: 'accept', why: 'SnowGolem.shear' }],
    'minecraft:strider': [{ item: 'minecraft:saddle', java: 'accept', why: 'an adult strider equips a saddle' }],
    'minecraft:trader_llama': [
        { item: 'minecraft:white_carpet', java: 'reject', why: 'an untamed llama cannot wear a carpet' }
    ],
    'minecraft:wolf': [{ item: 'minecraft:bone', java: 'accept', why: 'Wolf.tryToTame' }],
    'minecraft:zombie_horse': [
        { item: 'minecraft:saddle', java: 'reject', why: 'an untamed horse cannot use the slot' }
    ],
    'minecraft:zombie_villager': [
        { item: 'minecraft:golden_apple', java: 'reject', why: 'ZombieVillager cures only under Weakness' }
    ]
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
        slot === 'hand' && (index ?? 0) === 0 ? { identifier: () => item, data: () => 0 } : undefined
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

/** The hooks the server runs for a component; none means it only keeps the component's data. */
const hooksOf = (component: string): ReadonlySet<string> => realStack().content.entities.components.hooksOf(component);

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

/** What differs between the items Java accepts and the ones a component lists. */
const itemDifference = (java: Iterable<string>, server: ReadonlySet<string>): string | undefined => {
    const javaSet = new Set(java);
    const missing = [...javaSet].filter((item) => !server.has(item));
    const extra = [...server].filter((item) => !javaSet.has(item));
    if (missing.length === 0 && extra.length === 0) return undefined;
    return [
        ...(missing.length === 0 ? [] : [`it lists no ${missing.sort().join(', ')}`]),
        ...(extra.length === 0 ? [] : [`it lists ${extra.sort().join(', ')}, which Java refuses`])
    ].join('; ');
};

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

/** Tames a fresh subject for the scenario's player the way a successful taming roll does. */
const tamedIn = (current: Bench, bedrock: string): DataEntity => {
    const entity = spawnIn(current, bedrock);
    current.runtime.setOwner(entity.id, PLAYER);
    entity.instance.fire('minecraft:on_tame');
    entity.instance.applyQueuedEvents();
    return entity;
};

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
        java: "A vehicle seats as many riders as Java's canAddPassenger admits: two in a boat or raft, one in a chest boat, four on a happy ghast, three on a camel, one elsewhere.",
        reference:
            'Java Entity.canAddPassenger and its overrides in AbstractBoat, AbstractChestBoat, Camel, HappyGhast, Strider and AbstractNautilus; issue #3120',
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
            const baby = offspring.some((child) => child.instance.hasComponent('minecraft:is_baby'));
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
            'Java mobInteract of AbstractCow, MushroomCow, Goat, Sheep, SnowGolem, Bogged, CopperGolem, Creeper, IronGolem, Armadillo, Allay, ZombieVillager, Pig, Strider, Camel, AbstractHorse, Llama, Piglin and Wolf, and Mob.interact for saddles and carpets; issue #3118',
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
                const server = serverInteract(current, entity, probe.item);
                const agrees =
                    probe.java === 'accept' ? server !== 'reject' : withNamespace(server) === withNamespace(probe.java);
                return agrees ? [] : [`${probe.item}: the server answers ${server}, Java ${probe.java} (${probe.why})`];
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
        java: "An owner's empty-handed use toggles a tamed wolf, cat or parrot between sitting and standing; an ocelot is never tamed and never sits on command.",
        reference:
            'Java TamableAnimal.setOrderedToSit, called from Wolf.mobInteract, Cat.mobInteract and Parrot.mobInteract; Ocelot extends Animal; issue #3113',
        subjects: subjectsDeclaring('minecraft:sittable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:sittable'],
        run: (subject) => {
            const javaSits = javaIsA(javaClassOf(subject.javaId), `${ENTITY}/TamableAnimal`);
            const current = bench();
            const entity = tamedIn(current, subject.bedrock);
            current.runtime.interactWithItem(entity.id, PLAYER, 'minecraft:air', holding('minecraft:air'), {
                identifier: 'minecraft:air',
                count: 0
            });
            tickBench(current, 1);
            const sits = entity.body.sitting || entity.instance.hasComponent('minecraft:is_sitting');
            if (sits === javaSits) return undefined;
            return javaSits
                ? "the owner's empty hand does not sit it down"
                : 'it sits on command, which Java never does';
        }
    },
    {
        name: 'horse-temper',
        java: "Feeding an untamed horse or llama raises its temper by the item's amount, and each buck while ridden tames it when random.nextInt(maxTemper) falls below the temper; only the Java food tag's items feed it.",
        reference:
            'Java AbstractHorse.handleEating and Llama.handleEating (temper +3, +5, +10), AbstractHorse.modifyTemper, RunAroundLikeCrazyGoal.tick, and the horse_food, zombie_horse_food and llama_food tags; issue #3114',
        subjects: subjectsDeclaring('minecraft:tamemount'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:tamemount'],
        run: (subject) => {
            const differences: string[] = [];
            const tag = HORSE_FOOD[subject.javaId];
            if (tag === undefined) differences.push(`no Java food tag is recorded for ${subject.javaId}`);
            else {
                const items = itemDifference(
                    itemTag(tag),
                    listedItems(subject.bedrock, 'minecraft:tamemount', 'feed_items')
                );
                if (items !== undefined) differences.push(`its feed items differ from ${tag}: ${items}`);
            }
            if (hooksOf('minecraft:tamemount').size === 0)
                differences.push(
                    'the server never runs minecraft:tamemount, so it keeps no temper and riding never tames it'
                );
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'ocelot-trust',
        java: 'Feeding an ocelot cod or salmon makes it trust the player on a one in three roll.',
        reference:
            'Java Ocelot.mobInteract (ocelot_food tag, RandomSource.nextInt(3), setTrusting); issue #3115 and #3117',
        subjects: subjectsDeclaring('minecraft:trusting'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:trusting'],
        run: (subject) => {
            const differences: string[] = [];
            const items = itemDifference(
                itemTag('minecraft:ocelot_food'),
                listedItems(subject.bedrock, 'minecraft:trusting', 'trust_items')
            );
            if (items !== undefined) differences.push(items);
            const [bound] = javaRandomBounds(`${ENTITY}/animal/feline/Ocelot`, 'mobInteract');
            const [declared] = componentValues(subject.bedrock, 'minecraft:trusting');
            const probability = field(declared, 'probability');
            if (bound === undefined || probability !== 1 / bound)
                differences.push(`it trusts with probability ${String(probability)}, Java one in ${String(bound)}`);
            if (hooksOf('minecraft:trusting').size === 0) differences.push('the server never runs minecraft:trusting');
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'fox-trust',
        java: 'A fox trusts the players it was bred by and defends them.',
        reference:
            'Java Fox.addTrustedEntity, called from Fox.FoxBreedGoal.breed for both parents and the breeding player; issue #3115',
        subjects: subjectsDeclaring('minecraft:trust'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:trust'],
        run: () =>
            hooksOf('minecraft:trust').size === 0
                ? 'the server never runs minecraft:trust, so a bred fox trusts nobody'
                : undefined
    },
    {
        name: 'dolphin-bribe',
        java: "Feeding a dolphin any item in Java's fishes tag makes it lead the player to treasure.",
        reference: 'Java Dolphin.mobInteract (ItemTags.FISHES, setGotFish) and DolphinSwimToTreasureGoal; issue #3115',
        subjects: subjectsDeclaring('minecraft:bribeable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:bribeable'],
        run: (subject) => {
            const differences: string[] = [];
            const items = itemDifference(
                itemTag('minecraft:fishes'),
                listedItems(subject.bedrock, 'minecraft:bribeable', 'bribe_items')
            );
            if (items !== undefined) differences.push(items);
            if (hooksOf('minecraft:bribeable').size === 0)
                differences.push('the server never runs minecraft:bribeable, so a fed dolphin leads nowhere');
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
        java: 'Some mobs spawn carrying a rider: a spider or cave spider one in a hundred times a skeleton, a strider a zombified piglin, a camel husk a husk and a parched.',
        reference:
            'Java Spider.finalizeSpawn (random.nextInt(100) == 0), Strider.finalizeSpawn, CamelHusk spawning, Raid.joinRaid for ravager riders; issue #3116',
        subjects: subjectsDeclaring('minecraft:addrider'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:addrider'],
        run: () =>
            hooksOf('minecraft:addrider').size === 0
                ? 'the server never runs minecraft:addrider, so it spawns without the riders its definition names'
                : undefined
    },
    {
        name: 'genes',
        java: "A goat spawns screaming when nextDouble() is below 0.02, and a panda's genes follow Panda.Gene.getRandom's nextInt(16) table.",
        reference:
            'Java Goat.finalizeSpawn (0.02) and Panda.Gene.getRandom (0 lazy, 1 worried, 2 playful, 4 aggressive, below 9 weak, below 11 brown, else normal), Panda.getVariantFromGenes; issue #3119',
        subjects: subjectsDeclaring('minecraft:genetics'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:genetics'],
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
            } else differences.push(`no Java gene rule is recorded for ${subject.javaId}`);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
