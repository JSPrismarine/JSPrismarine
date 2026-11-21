import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';
import type { EntityPosition } from '@jsprismarine/entities';
import { normalizedItemIdentifier } from '@jsprismarine/entities/components/shared';
import { canUsePortal } from '@jsprismarine/prismarine/entity/portalUse';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { FLOOR_Y, TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';
import { GameEventListenerRegistry } from '@jsprismarine/prismarine/world/GameEventListenerRegistry';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { isRecord } from '../isRecord.ts';
import { javaOperations } from '../javaClassFile.ts';
import { serverContent } from '../serverStack.ts';
import { javaEntityClassName, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import type { SandboxRun } from './sandbox.ts';
import { SANDBOX_ORIGIN, inSandbox } from './sandbox.ts';
import type { EntitySubject } from './subjects.ts';
import { componentValues, entitiesDeclaring, field, mappedEntity, stringList } from './subjects.ts';

/**
 * How mobs react: to food, to a blow, to a vibration, to a portal, and what they do to the
 * players and mobs around them. Each scenario runs the server's entity runtime and reads Java's
 * side from the pinned jar.
 */

/** The subjects for a list of Java entity types the server runs. */
const subjectsOf = (javaIds: readonly string[]): readonly EntitySubject[] =>
    javaIds.flatMap((javaId) => mappedEntity(javaId) ?? []);

/** One method a Java entity class declares or inherits, or a throw naming it. */
const javaMethod = (javaId: string, method: string) => {
    const found = javaMethodOf(javaEntityClassName(javaId), method);
    if (found === undefined) throw new Error(`${javaEntityClassName(javaId)} has no ${method}`);
    return found;
};

/** The numbers a method pushes right before a call it makes, nearest last. */
const numbersBefore = (javaId: string, method: string, call: string): readonly number[] => {
    const operations = javaOperations(javaMethod(javaId, method).method);
    const at = operations.findIndex((operation) => operation.kind === 'call' && operation.target.endsWith(call));
    if (at < 0) return [];
    const numbers: number[] = [];
    for (let index = at - 1; index >= 0; index -= 1) {
        const operation = operations[index];
        if (operation?.kind !== 'number') break;
        numbers.unshift(operation.value);
    }
    return numbers;
};

/** The numbers a method pushes right after it reads a field. */
const numbersAfterField = (javaId: string, method: string, fieldName: string): readonly number[] => {
    const operations = javaOperations(javaMethod(javaId, method).method);
    const at = operations.findIndex((operation) => operation.kind === 'field' && operation.target === fieldName);
    return at < 0
        ? []
        : operations.slice(at + 1).flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []));
};

/** Adds every component group of the sandboxed entity whose name passes `pick`, and drops those `drop` names. */
export const switchGroups = (
    sandbox: SandboxRun,
    pick: (group: string) => boolean,
    drop: (group: string) => boolean
) => {
    const { instance } = sandbox.entity;
    const wanted = [...instance.type.groups.keys()].filter(pick);
    instance.restoreComponentGroups([
        ...instance.activeComponentGroups().filter((group) => !drop(group)),
        ...wanted.filter((group) => !instance.activeComponentGroups().includes(group))
    ]);
    return wanted;
};

/* -------------------------------------------------------------------------------------------- */
/* Portals                                                                                       */
/* -------------------------------------------------------------------------------------------- */

/**
 * Java's `canUsePortal` for a type: true where the class keeps `Entity`'s, false where an override
 * pushes only false, and false for a creaking its heart binds (`Creaking.isHeartBound`).
 */
const javaUsesPortal = (javaId: string, heartBound: boolean): boolean => {
    const found = javaMethod(javaId, 'canUsePortal');
    if (found.owner === 'Entity') return true;
    if (found.method.calls.some((call) => call.endsWith('.isHeartBound'))) return !heartBound;
    return pushedNumbers(found.method).some((value) => value !== 0);
};

/* -------------------------------------------------------------------------------------------- */
/* Feeding                                                                                       */
/* -------------------------------------------------------------------------------------------- */

/** The player id the feeding rows feed from. */
const FEEDER = 7;

/** Java's food per item, by Java identifier, from the item table the items package ships. */
let javaNutrition: ReadonlyMap<string, number> | undefined;
const nutritionOf = (javaItem: string): number | undefined => {
    if (javaNutrition === undefined) {
        const manifest = createRequire(import.meta.url).resolve('@jsprismarine/items/package.json');
        // Parsed JSON boundary: the item table the items package generates from Java's data.
        const table: unknown = JSON.parse(
            readFileSync(join(dirname(manifest), 'src', 'tables', javaServerCacheFolder, 'itemTypes.json'), 'utf-8')
        );
        const items = field(table, 'items');
        const found = new Map<string, number>();
        if (isRecord(items))
            for (const item of Object.values(items)) {
                const java = field(item, 'java');
                const nutrition = field(field(field(item, 'components'), 'minecraft:food'), 'nutrition');
                if (typeof java === 'string' && typeof nutrition === 'number') found.set(java, nutrition);
            }
        javaNutrition = found;
    }
    return javaNutrition.get(javaItem);
};

/** The item tag a Java type's `isFood` reads. */
const javaFoodTag = (javaId: string): string => {
    const tag = javaOperations(javaMethod(javaId, 'isFood').method).find(
        (operation) => operation.kind === 'field' && operation.target.startsWith('ItemTags.')
    );
    if (tag?.kind !== 'field') throw new Error(`${javaId} reads no item tag in isFood`);
    return `minecraft:${tag.target.slice('ItemTags.'.length).toLowerCase()}`;
};

/**
 * What one item heals a tamed Java pet by: `TamableAnimal.feed`'s nutrition times the scale its
 * `mobInteract` passes (1 for a cat, 2 for a wolf or a nautilus) for an item `isFood` takes, and
 * nothing for anything else or a type whose `mobInteract` never feeds, as the sniffer's
 * `Animal.mobInteract` does not.
 */
const javaHealOf = (javaId: string, item: string): number => {
    const scale = numbersBefore(javaId, 'mobInteract', '.feed')[0];
    if (scale === undefined) return 0;
    const foods = serverContent().tags.members('item', javaFoodTag(javaId));
    if (!foods.includes(item)) return 0;
    return (nutritionOf(item) ?? 1) * scale;
};

/** The pets whose server definition declares `minecraft:healable`, which a feeding row covers. */
const FED_PETS = [
    'minecraft:cat',
    'minecraft:wolf',
    'minecraft:nautilus',
    'minecraft:zombie_nautilus',
    'minecraft:sniffer'
] as const;

/** A view of the feeding player holding one item, which is all the interaction reads. */
const feederHolding = (item: string) => ({
    id: () => FEEDER,
    flag: () => undefined,
    names: (name: string) => (name === 'is_family' ? ['player'] : undefined),
    equipment: (slot: string, index?: number) =>
        slot === 'hand' && (index ?? 0) === 0 ? { identifier: () => item, data: () => 0 } : undefined
});

/** Tames the sandboxed entity the way its taming event would, owned by the feeder. */
const tame = (sandbox: SandboxRun): void => {
    const { instance } = sandbox.entity;
    const before = instance.activeComponentGroups().join();
    instance.fire('minecraft:on_tame');
    instance.applyQueuedEvents();
    if (instance.activeComponentGroups().join() === before)
        switchGroups(
            sandbox,
            (group) => /_tame$|_tamed$/.test(group) && !group.includes('baby'),
            (group) => group.includes('wild')
        );
    sandbox.entity.body.owner = FEEDER;
};

/* -------------------------------------------------------------------------------------------- */
/* Vibrations                                                                                    */
/* -------------------------------------------------------------------------------------------- */

interface ListeningStage {
    readonly runtime: EntityRuntime;
    readonly events: GameEventListenerRegistry;
}

let listening: ListeningStage | undefined;

/** A runtime over the shared content whose vibration listeners register with a real game-event registry. */
const listeningStage = (): ListeningStage => {
    if (listening !== undefined) return listening;
    const world = new TestEntityWorld();
    const events = new GameEventListenerRegistry({ getLoadedChunk: () => ({}) });
    const runtime = new EntityRuntime({
        content: serverContent,
        world: world.world,
        host: world.host,
        gameEvents: events,
        report: () => undefined
    });
    listening = { runtime, events };
    return listening;
};

let listenLane = 0;

/** What a listener of one type makes of one game event: the point of interest it records, if any. */
const heard = (listener: string, event: string, source: string): string | undefined => {
    const { runtime, events } = listeningStage();
    listenLane += 1;
    const at: EntityPosition = { x: 20_000 + listenLane * 64 + 0.5, y: FLOOR_Y + 1, z: 0.5 };
    const there: EntityPosition = { ...at, x: at.x + 6 };
    const ear = runtime.spawn(listener, at);
    const maker = runtime.spawn(source, there);
    try {
        if (ear === undefined || maker === undefined) return `unspawnable ${listener} or ${source}`;
        events.post({ event, at: there, sourceId: maker.id });
        for (const kind of ['suspicious_location', 'noteblock'])
            if (runtime.poi(kind, at, 16) !== undefined) return kind;
        return undefined;
    } finally {
        if (ear !== undefined) runtime.remove(ear.id, 'parity probe complete');
        if (maker !== undefined) runtime.remove(maker.id, 'parity probe complete');
    }
};

/** What Java's listener of one type does with one event: `listens` when its vibration user takes it. */
const JAVA_LISTENERS: Readonly<
    Record<string, readonly { event: string; source: string; kind: string | undefined; why: string }[]>
> = {
    'minecraft:warden': [
        {
            event: 'minecraft:step',
            source: 'minecraft:cow',
            kind: 'suspicious_location',
            why: "Warden$VibrationUser.onReceiveVibration sets the disturbance a cow's step makes"
        },
        {
            event: 'minecraft:step',
            source: 'minecraft:warden',
            kind: undefined,
            why: "VibrationSystem.User.isValidVibration passes over a warden's step, which Warden.dampensVibrations hides"
        }
    ],
    'minecraft:allay': [
        {
            event: 'minecraft:note_block_play',
            source: 'minecraft:cow',
            kind: 'noteblock',
            why: 'Allay$VibrationUser.onReceiveVibration likes the note block it hears'
        },
        {
            event: 'minecraft:step',
            source: 'minecraft:cow',
            kind: undefined,
            why: 'Allay$VibrationUser listens to the allay_can_listen tag, which holds no step'
        }
    ]
};

/* -------------------------------------------------------------------------------------------- */
/* Scenarios                                                                                     */
/* -------------------------------------------------------------------------------------------- */

/** Where a sandbox scenario stands a second entity, a few blocks from the subject. */
const beside = (distance: number): EntityPosition => ({ ...SANDBOX_ORIGIN, x: SANDBOX_ORIGIN.x + distance });

/** The scenarios of how mobs react. */
export const reactionScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'portal-use',
        java: 'A portal moves every entity but the ones whose Java class refuses canUsePortal: the ender dragon, a fishing hook and a creaking bound to its heart.',
        reference:
            'Java Entity.canUsePortal and its overrides in EnderDragon, FishingHook and Creaking (isHeartBound), read from the pinned jar',
        subjects: () => entitiesDeclaring('minecraft:dimension_bound'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:dimension_bound'],
        run: (subject) => {
            const heartBound = subject.javaId === 'minecraft:creaking';
            const java = javaUsesPortal(subject.javaId, heartBound);
            const server = inSandbox(subject.bedrock, 'air', (sandbox) => {
                if (heartBound)
                    switchGroups(
                        sandbox,
                        (group) => group === 'minecraft:spawned_by_creaking_heart',
                        () => false
                    );
                return canUsePortal(sandbox.entity.identifier, (component) =>
                    sandbox.entity.instance.hasComponent(component)
                );
            });
            if (typeof server === 'string') return server;
            return server === java
                ? undefined
                : `${heartBound ? 'bound to its heart, ' : ''}a portal ${server ? 'moves' : 'keeps'} it, where Java's ${java ? 'moves' : 'keeps'} it`;
        }
    },
    {
        name: 'heals-when-fed',
        java: "A tamed cat, wolf or nautilus fed a food its isFood takes heals by the food's nutrition times Java's scale for it, and a sniffer heals by nothing.",
        reference:
            "Java Cat, Wolf and AbstractNautilus.mobInteract (TamableAnimal.feed with scale 1, 2 and 2) and isFood (item tags cat_food, wolf_food, nautilus_food), Sniffer.mobInteract (Animal.mobInteract, which breeds and heals nothing), and the items' food nutrition, read from the pinned jar and the item table; issue #3192",
        subjects: () => subjectsOf(FED_PETS),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:healable'],
        run: (subject) => {
            const declared = componentValues(subject.bedrock, 'minecraft:healable').flatMap((value) => {
                const items = field(value, 'items');
                return Array.isArray(items)
                    ? items.flatMap((entry) => stringList(field(entry, 'item'))).map(normalizedItemIdentifier)
                    : [];
            });
            const scaled = numbersBefore(subject.javaId, 'mobInteract', '.feed').length > 0;
            const javaFoods = scaled ? serverContent().tags.members('item', javaFoodTag(subject.javaId)) : [];
            const probes = [...new Set([...declared, ...javaFoods])].filter(
                (item) => !item.endsWith('_bucket') && nutritionOf(item) !== undefined
            );
            const differences: string[] = [];
            for (const item of probes) {
                const healed = inSandbox(subject.bedrock, 'air', (sandbox) => {
                    tame(sandbox);
                    const health = sandbox.entity.instance.attributes.get('health');
                    if (health === undefined) return 'it has no health';
                    sandbox.entity.instance.attributes.set('health', 1);
                    sandbox.stack.runtime.interactWithItem(sandbox.entity.id, FEEDER, item, feederHolding(item));
                    return {
                        healed: (sandbox.entity.instance.attributes.get('health')?.current ?? 1) - 1,
                        room: health.max - 1
                    };
                });
                if (typeof healed === 'string') return healed;
                const java = Math.min(healed.room, javaHealOf(subject.javaId, item));
                if (Math.abs(healed.healed - java) > 1e-6)
                    differences.push(`${item} heals it ${healed.healed}, where Java heals ${java}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'parrot-poisoned-by-cookie',
        java: 'A parrot fed a cookie dies on the spot, as Java hurts it for all its health and poisons it.',
        reference:
            'Java Parrot.mobInteract (item tag parrot_poisonous_food: Poison 900, hurtServer Float.MAX_VALUE), read from the pinned jar; issue #3193',
        subjects: () => subjectsOf(['minecraft:parrot']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:healable'],
        run: (subject) => {
            const poisonous = serverContent().tags.members('item', 'minecraft:parrot_poisonous_food');
            const javaPoison = numbersAfterField(subject.javaId, 'mobInteract', 'MobEffects.POISON')[0];
            if (!poisonous.includes('minecraft:cookie') || javaPoison === undefined)
                return "Java's parrot no longer dies of a cookie";
            const dead = inSandbox(subject.bedrock, 'air', (sandbox) => {
                sandbox.stack.runtime.interactWithItem(
                    sandbox.entity.id,
                    FEEDER,
                    'minecraft:cookie',
                    feederHolding('minecraft:cookie')
                );
                sandbox.tick(3);
                // Dead, though its body stays for its death animation.
                return (sandbox.entity.instance.attributes.get('health')?.current ?? 0) <= 0;
            });
            if (typeof dead === 'string') return dead;
            return dead
                ? undefined
                : 'three ticks after eating a cookie it is still alive, where Java kills it at once';
        }
    },
    {
        name: 'bee-touches-poisonous-flowers',
        java: 'A bee touching an open eyeblossom is poisoned for 25 ticks, and one touching a wither rose withers for 40.',
        reference:
            'Java EyeblossomBlock.getBeeInteractionEffect (Poison 25 ticks) and WitherRoseBlock.getBeeInteractionEffect (Wither 40 ticks), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:bee']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:spell_effects'],
        run: (subject) => {
            const flowers = [
                { group: 'add_poison_effect', effect: 'minecraft:poison', java: 25 },
                { group: 'add_wither_effect', effect: 'minecraft:wither', java: 40 }
            ];
            const differences: string[] = [];
            for (const flower of flowers) {
                const duration = inSandbox(subject.bedrock, 'air', (sandbox) => {
                    if (
                        switchGroups(
                            sandbox,
                            (group) => group === flower.group,
                            () => false
                        ).length === 0
                    )
                        return `the server bee has no ${flower.group}`;
                    sandbox.tick(1);
                    return sandbox.entity.body.statusEffects.get(flower.effect)?.durationTicks ?? 0;
                });
                if (typeof duration === 'string') return duration;
                if (Math.abs(duration - flower.java) > 2)
                    differences.push(
                        `${flower.group} gives it ${flower.effect} for ${duration} ticks, where Java's lasts ${flower.java}`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'warden-angers-when-hit',
        java: "A warden a zombie hits is at once angry at it, Java's 80 plus 20, roars and goes for it.",
        reference:
            'Java Warden.hurtServer (increaseAngerAt(attacker, AngerLevel.ANGRY.getMinimumAnger() + 20)), AngerManagement.increaseAnger and WardenAi (roar, then fight), read from the pinned jar; issue #3186',
        subjects: () => subjectsOf(['minecraft:warden']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:anger_level', 'minecraft:suspect_tracking'],
        run: (subject) => {
            const targeted = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const zombie = sandbox.stack.runtime.spawn('minecraft:zombie', beside(5));
                if (zombie === undefined) return 'the sandbox could not put a zombie beside it';
                sandbox.stack.runtime.damage({
                    target: sandbox.entity.id,
                    attacker: zombie.id,
                    cause: 'entity_attack',
                    amount: 1,
                    source: { route: 'mob_attack', feedback: false, remembered: true }
                });
                for (let tick = 1; tick <= 300; tick += 1) {
                    sandbox.tick(1);
                    if (sandbox.entity.body.target === zombie.id) return tick;
                }
                return undefined;
            });
            if (typeof targeted === 'string') return targeted;
            return targeted === undefined
                ? 'hit by a zombie, it is not after the zombie 300 ticks later, where Java angers at it at once and roars at it'
                : undefined;
        }
    },
    {
        name: 'warden-darkens-players',
        java: 'A warden gives every player within 20 blocks Darkness for 260 ticks, once each 120 ticks.',
        reference:
            'Java Warden.customServerAiStep ((tickCount + id) % 120 == 0) and Warden.applyDarknessAround (Darkness 260, radius 20), read from the pinned jar; issue #3185',
        subjects: () => subjectsOf(['minecraft:warden']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:mob_effect'],
        run: (subject) => {
            const darkness = numbersAfterField(subject.javaId, 'applyDarknessAround', 'MobEffects.DARKNESS')[0];
            const interval = numbersBefore(subject.javaId, 'customServerAiStep', '.position')[0];
            if (darkness === undefined || interval === undefined) return "Java's warden no longer darkens players";
            const given = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const player = sandbox.stack.runtime.spawnPlayer(910_001, beside(6));
                if (player === undefined) return 'the sandbox could not put a player beside it';
                // A connected player is one the host reports, which is how the runtime finds it.
                sandbox.stack.world.players = [
                    { id: player.id, identifier: player.identifier, position: player.position }
                ];
                for (let tick = 1; tick <= interval + 5; tick += 1) {
                    sandbox.tick(1);
                    const effect = player.body.statusEffects.get('minecraft:darkness');
                    if (effect !== undefined) return { tick, duration: effect.durationTicks };
                }
                return undefined;
            });
            if (typeof given === 'string') return given;
            if (given === undefined)
                return `a player six blocks away gets no Darkness in ${interval + 5} ticks, where Java gives it within ${interval}`;
            return Math.abs(given.duration - darkness) <= 2
                ? undefined
                : `a player six blocks away gets Darkness for ${given.duration} ticks, where Java gives ${darkness}`;
        }
    },
    {
        name: 'listens-for-vibrations',
        java: "A warden takes in a cow's step but not another warden's, and an allay takes in a note block but not a step.",
        reference: `Java ${Object.values(JAVA_LISTENERS)
            .flat()
            .map((entry) => entry.why)
            .join('; ')}, VibrationSystem and Warden.dampensVibrations`,
        subjects: () => entitiesDeclaring('minecraft:vibration_listener'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            subject.javaId === 'minecraft:warden'
                ? ['minecraft:vibration_listener', 'minecraft:vibration_damper']
                : ['minecraft:vibration_listener'],
        run: (subject) => {
            const probes = JAVA_LISTENERS[subject.javaId];
            if (probes === undefined) return `no Java vibration user is recorded for ${subject.javaId}`;
            const differences = probes.flatMap((probe) => {
                const server = heard(subject.bedrock, probe.event, probe.source);
                return server === probe.kind
                    ? []
                    : [
                          `${probe.event} from a ${probe.source} ${server === undefined ? 'goes unheard' : `records a ${server}`}, where ${probe.why}`
                      ];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'iron-golem-throws-target-up',
        java: "An iron golem's blow throws its target up 0.4 beyond what a blow's own push does, as Java's IronGolem.doHurtTarget adds.",
        reference:
            'Java IronGolem.doHurtTarget (setDeltaMovement + 0.4 up, less knockback resistance) and LivingEntity.knockback, read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:iron_golem']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:apply_knockback_rules'],
        run: (subject) => {
            const java = numbersBefore(subject.javaId, 'doHurtTarget', 'Vec3.add').at(-2) ?? 0;
            const lift = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const { runtime } = sandbox.stack;
                const golem = runtime.bodyOf(sandbox.entity.instance);
                const other = runtime.spawn('minecraft:iron_golem', beside(-3));
                const pushed = runtime.spawn('minecraft:zombie', beside(1.5));
                const control = runtime.spawn('minecraft:zombie', beside(-1.5));
                const otherBody = other === undefined ? undefined : runtime.bodyOf(other.instance);
                const pushedMob = pushed === undefined ? undefined : runtime.mobById(pushed.id);
                const controlMob = control === undefined ? undefined : runtime.mobById(control.id);
                if (golem === undefined || otherBody === undefined || pushed === undefined || control === undefined)
                    return 'the sandbox could not put two zombies beside it';
                if (pushedMob === undefined || controlMob === undefined) return 'the sandbox lost its zombies';
                pushed.body.velocity = { x: 0, y: 0, z: 0 };
                control.body.velocity = { x: 0, y: 0, z: 0 };
                runtime.attack(golem, pushedMob);
                // The control takes a plain blow of the same size, through the damage route a golem's blow
                // takes, so the difference is the golem's own lift.
                runtime.damage({
                    target: control.id,
                    attacker: other?.id,
                    cause: 'entity_attack',
                    amount: 1,
                    source: { route: 'mob_attack', feedback: false, remembered: false }
                });
                return {
                    golem: pushed.body.velocity.y,
                    plain: control.body.velocity.y,
                    resistance: pushed.facts.knockbackResistance
                };
            });
            if (typeof lift === 'string') return lift;
            const expected = java * (1 - lift.resistance);
            const extra = lift.golem - lift.plain;
            return Math.abs(extra - expected) < 0.02
                ? undefined
                : `its blow lifts a zombie ${extra.toFixed(3)} beyond a plain blow's push, where Java's lifts it ${expected.toFixed(3)} more`;
        }
    }
];
