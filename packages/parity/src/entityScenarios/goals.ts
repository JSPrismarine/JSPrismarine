import type { EntityPosition } from '@jsprismarine/entities';
import type { NavigationView } from '@jsprismarine/entity-goals/navigation/view';
import type { BlockQuery, GoalMob, GoalWorld } from '@jsprismarine/entity-goals/world';
import { javaItemToBedrock } from '@jsprismarine/mapping';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { loadJavaEntityAttributes } from '../goldens.ts';
import type { JavaGoal, JavaValue } from '../../../bedrock-data/utils/java-goals/goals.ts';
import { pinnedJavaClass } from '../javaClassFile.ts';
import {
    javaClass,
    javaEntityClass,
    javaGoalsOf,
    javaMethodNumbers,
    javaStaticsRead,
    javaSuperChain
} from '../javaGoals.ts';
import { realStack, serverContent } from '../serverStack.ts';
import {
    declaredGoals,
    gameTicks,
    PROBE_IDENTIFIER,
    probeGoal,
    runTicks,
    startChance,
    walkSpeeds
} from './goalHarness.ts';
import type { DeclaredGoal, ProbeSetup } from './goalHarness.ts';
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
 * The shared AI goals: what the server's `minecraft:behavior.*` goals decide for each mob,
 * against the goals the mob's Java class registers.
 *
 * The Java side is read from the pinned server jar: `javaGoalsOf` runs each mob's
 * `registerGoals` symbolically and returns every goal with the arguments its constructors end up
 * holding, and `javaMethodNumbers` reads a goal class's own constants, such as `FloatGoal`'s 0.8
 * jump chance. The server side runs the goal the entity's definition declares through the real
 * goal code and scheduler, and observes what it decides.
 *
 * A Java mob whose AI is a `Brain` registers no goals; for it the server must run the brain and
 * leave the Bedrock goal idle, which `brain-runs-instead` compares.
 */

const GOAL_PACKAGE = 'net/minecraft/world/entity/ai/goal/';
const PREFIX = 'minecraft:behavior.';

/** The Java goals this theme compares, keyed by the Bedrock goal each one corresponds to. */
const THEME_GOALS = [
    'look_at_player',
    'random_stroll',
    'random_look_around',
    'float',
    'nearest_attackable_target',
    'hurt_by_target',
    'panic',
    'tempt',
    'melee_box_attack',
    'avoid_mob_type',
    'breed',
    'mount_pathing',
    'follow_parent',
    'pickup_items',
    'equip_item',
    'ranged_attack',
    'random_swim',
    'player_ride_tamed',
    'find_mount',
    'swim_idle',
    'flee_sun',
    'swim_wander',
    'run_around_like_crazy',
    'follow_owner',
    'leap_at_target',
    'stomp_turtle_egg',
    'celebrate',
    'move_to_village',
    'use_kinetic_weapon',
    'timer_flag_1',
    'move_to_water',
    'move_towards_home_restriction',
    'stay_while_sitting',
    'teleport_to_owner'
] as const;

/** A number a Java goal was constructed with, or undefined when it was not a constant. */
const numberOf = (value: JavaValue | undefined): number | undefined =>
    value?.kind === 'number' ? value.value : undefined;

/** One named constructor parameter of a Java goal, as a number. */
const param = (goal: JavaGoal, name: string): number | undefined => numberOf(goal.params.get(name));

/** Whether two numbers agree, to a relative tolerance. */
const close = (server: number, java: number, tolerance = 1e-3): boolean =>
    Math.abs(server - java) <= tolerance * Math.max(1, Math.abs(java));

/** A number as a short decimal, for a difference sentence. */
const show = (value: number | undefined): string =>
    value === undefined ? 'nothing' : String(Math.round(value * 10000) / 10000);

/** Java's `Goal.reducedTickDelay`: a delay halved, rounding up, for a goal that only ticks on selector runs. */
const reducedTickDelay = (ticks: number): number => Math.ceil(ticks / 2);

/** The goals a Java mob registers, or none when its type constructs no class the jar holds. */
const javaGoals = (javaId: string): readonly JavaGoal[] => {
    const entityClass = javaEntityClass(javaId);
    return entityClass === undefined ? [] : javaGoalsOf(entityClass);
};

/** Whether a Java goal is, or extends, one of the vanilla goal classes named by simple name. */
const isGoal = (goal: JavaGoal, names: readonly string[]): boolean => goal.classes.some((name) => names.includes(name));

/** Whether a class literal a Java goal holds names `ancestor` or a subclass of it. */
const classExtends = (value: JavaValue | undefined, ancestor: string): boolean =>
    value?.kind === 'class' && javaSuperChain(value.name).some((name) => name.endsWith(`/${ancestor}`));

/** The Java movement speed attribute for a mob, which its goals' speed modifiers scale. */
const javaMovement = (javaId: string): number | undefined =>
    loadJavaEntityAttributes()[javaId]?.attributes['minecraft:movement_speed'];

/**
 * Compares a goal's walking speed. The multiplier is the goal's own decision and the base speed
 * is the entity's movement stat, which ADR 0001 gives to Bedrock, so a speed agrees when the
 * multiplier matches Java's modifier or when the two products, the speed the mob actually walks,
 * agree within two percent.
 */
const speedDifference = (
    subject: EntitySubject,
    declared: DeclaredGoal,
    label: string,
    server: number | undefined,
    java: number | undefined
): string | undefined => {
    if (java === undefined) return undefined;
    if (server === undefined) return `${label} never walks, where Java's goal walks at ${show(java)} times its speed`;
    if (close(server, java)) return undefined;
    const serverSpeed = server * (declared.movement ?? Number.NaN);
    const javaSpeed = java * (javaMovement(subject.javaId) ?? Number.NaN);
    if (close(serverSpeed, javaSpeed, 0.02)) return undefined;
    return `${label} walks at ${show(server)} times its speed (${show(serverSpeed)} blocks a tick), where Java's goal uses ${show(java)} (${show(javaSpeed)})`;
};

/**
 * Whether the server runs this mob's brain instead of its Bedrock goals. The server's brain
 * registry is keyed by Java's identifiers, the names `@jsprismarine/entity-brains` registers.
 */
const brainOnly = (subject: EntitySubject): boolean => {
    const brain = serverContent().entities.brains.get(subject.javaId);
    return brain !== undefined && !brain.alsoRunsGoals;
};

/** The issues that track this theme's differences from Java, each with the sentences that belong to it. */
const GOAL_ISSUES: readonly (readonly [issue: number, matches: RegExp])[] = [
    [3132, /beside its brain/],
    [3133, /only charges while mounted/],
    [3134, /closes in to a different range|closing in, it never walks/],
    [3135, /never calls nearby mobs/],
    [3130, /registers no |has no |runs no |but the server runs |never jumps|not even below|iron sword 2\.5 blocks/],
    [3165, /does not pick up an item it stands on/],
    [3166, /targets wither, which/],
    // Anything else is a goal parameter, which Java's registerGoals arguments decide (ADR 0019).
    [3128, /./]
];

/** Records a goal difference as a defect with the issues that track each of its sentences. */
const goalGap = (java: string) => (_subject: EntitySubject, difference: string) => {
    const issues = new Set<number>();
    for (const sentence of difference.split('; ')) {
        const match = GOAL_ISSUES.find(([, pattern]) => pattern.test(sentence));
        if (match !== undefined) issues.add(match[0]);
    }
    const tracked = [...issues].map((issue) => `#${issue}`).join(', ');
    return { kind: 'defect' as const, reason: `${java} Observed: ${difference}. Tracked in ${tracked}.` };
};

/** One Bedrock goal compared with the Java goal classes it stands for. */
interface GoalComparison {
    /** The Bedrock goal, without the `minecraft:behavior.` prefix. */
    readonly aspect: (typeof THEME_GOALS)[number];
    /** The Java goal classes, by simple name, that do what the Bedrock goal does. */
    readonly javaClasses: readonly string[];
    /** Narrows the matching Java goals, such as to a look goal that looks at players. */
    readonly select?: (goal: JavaGoal) => boolean;
    readonly java: string;
    readonly reference: string;
    /** What the server's goal, declared with `body`, does differently from one Java goal. */
    readonly compare?: (subject: EntitySubject, declared: DeclaredGoal, java: JavaGoal) => readonly string[];
    /**
     * What the server's goals, every body together, do differently from all the matching Java
     * goals together, for a goal Java splits across several instances, such as one target goal
     * per target class.
     */
    readonly compareAll?: (
        subject: EntitySubject,
        declared: readonly DeclaredGoal[],
        java: readonly JavaGoal[]
    ) => readonly string[];
    readonly classify?: BehaviorScenario<EntitySubject>['classify'];
}

/**
 * Builds the scenario for one comparison over every goal-running mob that declares the goal. Each
 * body the definition declares, in its components or a component group, has to match one of the
 * mob's Java goals; a mob whose Java class registers none of them runs a goal Java does not have.
 */
const goalScenario = (comparison: GoalComparison): BehaviorScenario<EntitySubject> => {
    const component = `${PREFIX}${comparison.aspect}`;
    return {
        name: `goal-${comparison.aspect.replaceAll('_', '-')}`,
        java: comparison.java,
        reference: comparison.reference,
        subjects: () => entitiesDeclaring(component).filter((subject) => !brainOnly(subject)),
        idOf: (subject) => subject.javaId,
        aspects: () => [component],
        classify: comparison.classify ?? goalGap(comparison.java),
        run: (subject) => {
            const java = javaGoals(subject.javaId).filter(
                (goal) => isGoal(goal, comparison.javaClasses) && (comparison.select?.(goal) ?? true)
            );
            if (java.length === 0 && comparison.javaClasses.length > 0) {
                return `Java's ${subject.javaId} registers no ${comparison.javaClasses.join(' or ')}, but the server runs ${component}`;
            }
            const declared = declaredGoals(subject.bedrock, component);
            const { compare, compareAll } = comparison;
            const differences = [
                ...(compareAll === undefined ? [] : compareAll(subject, declared, java)),
                ...(compare === undefined
                    ? []
                    : declared.flatMap((body) =>
                          java
                              .map((goal) => compare(subject, body, goal))
                              .reduce((left, right) => (right.length < left.length ? right : left))
                      ))
            ];
            return differences.length === 0 ? undefined : [...new Set(differences)].join('; ');
        }
    };
};

/** A player one block away, the subject every look and target probe offers. */
const nearbyPlayer = {
    id: 'player',
    position: () => ({ x: 1, y: 0, z: 0 }),
    view: () => ({ id: () => 'player', names: () => undefined })
};

/** The radius a goal asks the world for players within, or undefined when it never asks. */
const playerRadius = (component: string, body: unknown): number | undefined => {
    const radii: number[] = [];
    const harness = probeGoal(component, body, {
        random: () => 0,
        world: {
            players: (radius) => {
                radii.push(radius);
                return [nearbyPlayer];
            }
        }
    });
    gameTicks(harness, 2);
    return radii[0];
};

/** Compares a hold drawn as `base + nextInt(spread)` game ticks with the server's shortest and longest hold. */
const holdDifference = (
    label: string,
    component: string,
    body: unknown,
    setup: ProbeSetup & { readonly before: number },
    [base, spread]: readonly number[]
): string | undefined => {
    if (base === undefined || spread === undefined) return `Java's ${label} constants could not be read`;
    const shortest = runTicks(component, body, setup, setup.before, 0);
    const longest = runTicks(component, body, setup, setup.before, 1 - 1e-9);
    // A tick either side is the scheduler's phase, not the goal's decision.
    if (Math.abs(shortest - base) <= 2 && Math.abs(longest - (base + spread - 1)) <= 2) return undefined;
    return `${label} lasts ${shortest} to ${longest} game ticks, where Java's lasts ${base} to ${base + spread - 1}`;
};

const javaGoalClass = (name: string): string => `${GOAL_PACKAGE}${name}`;

/**
 * A mob's own goal class, such as `PolarBear$PolarBearPanicGoal`, found beside the mob class or one
 * it extends, since a goal records only its simple name.
 */
const javaMobGoalClass = (javaId: string, simple: string): ReturnType<typeof javaClass> => {
    const entityClass = javaEntityClass(javaId);
    if (entityClass === undefined) return undefined;
    for (const name of javaSuperChain(entityClass)) {
        const found = javaClass(`${name.slice(0, name.lastIndexOf('/') + 1)}${simple}`);
        if (found !== undefined) return found;
    }
    return undefined;
};

/**
 * Compares a wander goal: the bound of the draw that starts it, which Java's RandomStrollGoal takes
 * as reducedTickDelay(interval), and the speed it walks at.
 */
const strollDifferences = (
    subject: EntitySubject,
    declared: DeclaredGoal,
    java: JavaGoal,
    component: string,
    label: string,
    flags: ProbeSetup['flags']
): readonly string[] => {
    const differences: string[] = [];
    const bounds: number[] = [];
    const probe = probeGoal(component, declared.body, {
        flags,
        random: () => 0.5,
        randomInt: (bound) => {
            bounds.push(bound);
            return 0;
        }
    });
    gameTicks(probe, 1);
    const interval = param(java, 'interval');
    if (interval !== undefined && bounds[0] !== reducedTickDelay(interval)) {
        differences.push(
            `${label} starts on one selector tick in ${show(bounds[0])}, where Java's starts on one in ${reducedTickDelay(interval)}`
        );
    }
    const speed = speedDifference(subject, declared, label, walkSpeeds(probe)[0], param(java, 'speedModifier'));
    if (speed !== undefined) differences.push(speed);
    return differences;
};

/** Flat open ground in full sun but for shade one block off, where a mob fleeing the sun can walk. */
const FLAT_SHADE: NavigationView = {
    blockAt: (position) => (position.y < 0 ? 'minecraft:stone' : 'minecraft:air'),
    isPassable: (position) => position.y >= 0,
    isSolid: (position) => position.y < 0,
    isWater: () => false,
    isLava: () => false,
    canSeeSky: (position) => Math.floor(position.x) === 0 && Math.floor(position.z) === 0,
    walkTargetValue: () => -1
};

/**
 * What loot a Java mob picks up: any, when some class it extends short of `Mob` turns
 * `setCanPickUpLoot` on, as the zombies and skeletons do in `finalizeSpawn`; banners, when it only
 * overrides `pickUpItem`, as a raider does for the ominous banner; otherwise none.
 */
const javaLoot = (javaId: string): 'any' | 'banners' | 'none' => {
    const entityClass = javaEntityClass(javaId);
    if (entityClass === undefined) return 'none';
    const chain = javaSuperChain(entityClass);
    const methods = chain
        .slice(
            0,
            Math.max(
                0,
                chain.findIndex((name) => name.endsWith('/Mob'))
            )
        )
        .flatMap((name) => pinnedJavaClass(name));
    if (methods.some((method) => method.calls.some((call) => call.endsWith('.setCanPickUpLoot')))) return 'any';
    return methods.some((method) => method.name === 'pickUpItem') ? 'banners' : 'none';
};

/** A Java living entity type as a probe offers it to a goal: its Bedrock identity and families. */
interface Candidate {
    readonly javaId: string;
    readonly bedrock: string;
    readonly families: readonly string[];
}

let candidateList: readonly Candidate[] | undefined;

/** Every Java living entity type the server runs, each a candidate a target or avoid goal may pick. */
const candidates = (): readonly Candidate[] => {
    candidateList ??= javaEntityIds().flatMap((javaId) => {
        const mapped = mappedEntity(javaId);
        const entityClass = javaEntityClass(javaId);
        if (mapped === undefined || entityClass === undefined) return [];
        if (!javaSuperChain(entityClass).some((name) => name.endsWith('/LivingEntity'))) return [];
        const families = componentValues(mapped.bedrock, 'minecraft:type_family').flatMap((value) =>
            stringList(field(value, 'family'))
        );
        return [{ javaId, bedrock: mapped.bedrock, families }];
    });
    return candidateList;
};

/** A candidate standing at `at`, adult or baby, with the facts a filter reads of `other`. */
const candidateMob = (candidate: Candidate, at: EntityPosition, baby = false, held?: string): GoalMob => ({
    id: candidate.javaId,
    position: () => at,
    view: () => ({
        id: () => candidate.javaId,
        flag: (name) => (name === 'is_baby' ? baby : undefined),
        names: (name) => (name === 'is_family' ? candidate.families : undefined)
    }),
    identifier: () => candidate.bedrock,
    ...(held === undefined ? {} : { heldItem: () => held })
});

const PLAYER: Candidate = { javaId: 'minecraft:player', bedrock: 'minecraft:player', families: ['player', 'mob'] };

/** A player at `at`, holding `held` when given. */
const playerAt = (at: EntityPosition, held?: string): GoalMob => candidateMob(PLAYER, at, false, held);

/** Whether a Java entity type's class is, or extends, the class a Java goal names. */
const javaIsA = (javaId: string, value: JavaValue | undefined): boolean => {
    if (value?.kind !== 'class') return false;
    const entityClass = javaEntityClass(javaId);
    return entityClass !== undefined && javaSuperChain(entityClass).includes(value.name);
};

/**
 * Whether a Java goal narrows its class with a predicate of the mob's own, such as a fox's
 * trusted-player check, rather than the vanilla goal's default, or is a subclass of the mob's own. A narrowed goal names an upper
 * bound of what Java picks, so only picks outside it count as differences.
 */
const narrowed = (goal: JavaGoal, ...names: readonly string[]): boolean =>
    // A mob's own subclass, such as Spider$SpiderTargetGoal, may refuse in its own canUse.
    goal.classes[0] !== goal.goal ||
    names.some((name) => {
        const value = goal.params.get(name);
        if (value === undefined || value.kind === 'unknown') return false;
        // EntitySelector's shared predicates, such as NO_CREATIVE_OR_SPECTATOR, only drop players out of play.
        if (value.kind === 'field' && value.field.owner.endsWith('/EntitySelector')) return false;
        return !(value.kind === 'lambda' && value.target?.owner.startsWith(GOAL_PACKAGE) === true);
    });

/** A short list of entity names for a difference sentence. */
const names = (javaIds: Iterable<string>): string =>
    [...javaIds]
        .map((javaId) => javaId.replace('minecraft:', ''))
        .sort()
        .join(', ');

/** A candidate a probe offers through `mobs`, and through `players` too when it is a player. */
const offering = (mob: GoalMob, isPlayer: boolean, radii: number[] = []): GoalWorld => ({
    players: (radius) => {
        radii.push(radius);
        return isPlayer ? [mob] : [];
    },
    // The server's mob search includes players, as Java's entity search does.
    mobs: (radius) => {
        radii.push(radius);
        return [mob];
    }
});

/** The Java attribute base for a mob, such as its follow range. */
const javaAttribute = (javaId: string, attribute: string): number | undefined =>
    loadJavaEntityAttributes()[javaId]?.attributes[attribute];

/** The Java and Bedrock item identifiers a Java item predicate accepts, mapped to the Bedrock items the server holds. */
const javaItemsOf = (value: JavaValue | undefined, mobClass: string): ReadonlySet<string> => {
    const items = new Set<string>();
    const add = (javaItem: string): void => {
        const mapped = javaItemToBedrock(javaItem);
        if (mapped.kind !== 'unknown') items.add(mapped.bedrock.identifier);
    };
    const statics =
        value?.kind === 'lambda' && value.target !== undefined ? javaStaticsRead(value.target, mobClass) : [];
    for (const read of statics) {
        const name = `minecraft:${read.name.toLowerCase()}`;
        if (read.owner.endsWith('/ItemTags'))
            for (const member of serverContent().tags.members('item', name)) add(member);
        else if (read.owner.endsWith('/Items')) add(name);
    }
    return items;
};

/** The Bedrock items a server goal body lists under `key`, namespaced. */
const bodyItems = (body: unknown, key: string): readonly string[] => {
    const value = field(body, key);
    const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return entries.flatMap((entry) => {
        const name = typeof entry === 'string' ? entry : (field(entry, 'item') ?? field(entry, 'name'));
        return typeof name === 'string' ? [withNamespace(name)] : [];
    });
};

/** The first walk a probe asks for after `ticks` game ticks, as its speed multiplier. */
const firstWalk = (probe: ReturnType<typeof probeGoal>, ticks = 2): number | undefined => {
    gameTicks(probe, ticks);
    return walkSpeeds(probe)[0];
};

const comparisons: readonly GoalComparison[] = [
    {
        aspect: 'look_at_player',
        javaClasses: ['LookAtPlayerGoal'],
        select: (goal) =>
            classExtends(goal.params.get('lookAtType'), 'Player') && !goal.classes.includes('LookAtTradingPlayerGoal'),
        java: 'A mob looks at a player within its LookAtPlayerGoal distance, starting on its probability per selector tick and holding the look for 40 + nextInt(40) ticks.',
        reference:
            "Java LookAtPlayerGoal (canUse, start's adjustedTickDelay(40 + nextInt(40))) and each mob's registerGoals arguments, read from the pinned jar",
        compare: (_subject, { body }, java) => {
            const component = `${PREFIX}look_at_player`;
            const differences: string[] = [];
            const distance = param(java, 'lookDistance');
            const radius = playerRadius(component, body);
            if (distance !== undefined && (radius === undefined || !close(radius, distance)))
                differences.push(
                    `it looks at players within ${show(radius)} blocks, where Java's within ${show(distance)}`
                );
            const probability = param(java, 'probability');
            const world = { players: () => [nearbyPlayer] };
            const chance = startChance(component, body, { world });
            if (probability !== undefined && !close(chance, Math.min(1, probability), 0.01))
                differences.push(
                    `a look starts on a ${show(chance)} chance, where Java's starts on ${show(probability)}`
                );
            // `start` loads 40 and 40 for `40 + nextInt(40)`; a look draws its chance first. A goal
            // that starts on every tick, such as a vindicator's InteractGoal, has no hold to see:
            // `GoalSelector.tick` starts it again in the pass that stops it, so the look never ends.
            const hold =
                (probability ?? 0) >= 1
                    ? undefined
                    : holdDifference(
                          'a look',
                          component,
                          body,
                          { world, before: 1 },
                          javaMethodNumbers(javaGoalClass('LookAtPlayerGoal'), 'start').slice(-2)
                      );
            if (hold !== undefined) differences.push(hold);
            return differences;
        }
    },
    {
        aspect: 'random_look_around',
        javaClasses: ['RandomLookAroundGoal'],
        java: 'A mob glances in a random direction on a 0.02 chance per tick and holds it for 20 + nextInt(20) ticks.',
        reference: 'Java RandomLookAroundGoal.canUse and start, read from the pinned jar',
        compare: (_subject, { body }) => {
            const component = `${PREFIX}random_look_around`;
            const differences: string[] = [];
            const [probability] = javaMethodNumbers(javaGoalClass('RandomLookAroundGoal'), 'canUse');
            const chance = startChance(component, body);
            if (probability !== undefined && !close(chance, probability, 0.01))
                differences.push(
                    `a glance starts on a ${show(chance)} chance, where Java's starts on ${show(probability)}`
                );
            // `start` loads 2 pi for the direction, then 20 and 20 for `20 + nextInt(20)`; a glance
            // draws its chance and its direction first.
            const hold = holdDifference(
                'a glance',
                component,
                body,
                { before: 2 },
                javaMethodNumbers(javaGoalClass('RandomLookAroundGoal'), 'start').slice(-2)
            );
            if (hold !== undefined) differences.push(hold);
            return differences;
        }
    },
    {
        aspect: 'float',
        javaClasses: ['FloatGoal'],
        java: 'A mob in deep water jumps on a 0.8 chance every tick.',
        reference: 'Java FloatGoal.canUse and tick, read from the pinned jar',
        compare: (_subject, { body }) => {
            const component = `${PREFIX}float`;
            const [java] = javaMethodNumbers(javaGoalClass('FloatGoal'), 'tick');
            if (java === undefined) return [];
            const jumps = (draw: number): boolean => {
                const harness = probeGoal(component, body, { flags: { in_water: true }, random: () => draw });
                gameTicks(harness, 1);
                return harness.actuator.count('jump') > 0;
            };
            const below = jumps(java - 0.001);
            const above = jumps(java + 0.001);
            if (below && !above) return [];
            return [
                `in water it jumps on draws ${below ? 'below' : 'not even below'} ${show(java)} and ${above ? 'above it too' : 'not above it'}, where Java jumps on a ${show(java)} chance`
            ];
        }
    },
    {
        aspect: 'random_stroll',
        javaClasses: ['RandomStrollGoal'],
        select: (goal) => !goal.classes.includes('RandomSwimmingGoal'),
        java: 'A mob starts a random stroll on one selector tick in reducedTickDelay(interval), interval 120 unless the mob sets one, and walks at its goal speed modifier.',
        reference: "Java RandomStrollGoal.canUse and each mob's registerGoals arguments, read from the pinned jar",
        compare: (subject, declared, java) =>
            strollDifferences(subject, declared, java, `${PREFIX}random_stroll`, 'a stroll', {})
    },
    {
        aspect: 'nearest_attackable_target',
        javaClasses: ['NearestAttackableTargetGoal'],
        java: 'A mob targets the nearest entity of each class its NearestAttackableTargetGoals name, within its follow range, scanning on one selector tick in reducedTickDelay(randomInterval).',
        reference:
            "Java NearestAttackableTargetGoal and TargetGoal.getFollowDistance, each mob's registerGoals target classes read from the pinned jar, and the follow_range attribute from the Java attribute dump",
        compareAll: (subject, declared, java) => {
            const component = `${PREFIX}nearest_attackable_target`;
            const differences: string[] = [];
            const javaTargets = new Set<string>();
            const required = new Set<string>();
            for (const goal of java) {
                for (const candidate of candidates()) {
                    if (!javaIsA(candidate.javaId, goal.params.get('targetType'))) continue;
                    javaTargets.add(candidate.javaId);
                    if (!narrowed(goal, 'selector', 'subselector')) required.add(candidate.javaId);
                }
            }
            const radii: number[] = [];
            const serverTargets = new Set<string>();
            for (const candidate of [PLAYER, ...candidates().filter((entry) => entry.javaId !== PLAYER.javaId)]) {
                const isPlayer = candidate.javaId === PLAYER.javaId;
                const targeted = declared.some(({ body }) =>
                    [false, true].some((baby) => {
                        const mob = candidateMob(candidate, { x: 3, y: 0, z: 0 }, baby);
                        let chosen: GoalMob | undefined;
                        const probe = probeGoal(component, body, {
                            random: () => 0,
                            randomInt: () => 0,
                            world: {
                                ...offering(mob, isPlayer, radii),
                                target: () => chosen,
                                setTarget: (next) => {
                                    chosen = next;
                                }
                            }
                        });
                        gameTicks(probe, 1);
                        return chosen?.id === mob.id;
                    })
                );
                if (targeted) serverTargets.add(candidate.javaId);
            }
            const missing = [...required].filter((javaId) => !serverTargets.has(javaId));
            const extra = [...serverTargets].filter((javaId) => !javaTargets.has(javaId));
            if (missing.length > 0) differences.push(`it never targets ${names(missing)}, which Java's targets`);
            if (extra.length > 0) differences.push(`it targets ${names(extra)}, which Java's never targets`);

            const follow = javaAttribute(subject.javaId, 'minecraft:follow_range');
            const radius = radii.length === 0 ? undefined : Math.max(...radii);
            if (follow !== undefined && (radius === undefined || !close(radius, follow)))
                differences.push(
                    `it searches ${show(radius)} blocks out, where Java's follow range is ${show(follow)}`
                );

            const interval = java.map((goal) => param(goal, 'randomInterval')).find((value) => value !== undefined);
            if (interval !== undefined) {
                const bounds = declared.map(({ body }) => {
                    const drawn: number[] = [];
                    const probe = probeGoal(component, body, {
                        random: () => 0.5,
                        randomInt: (bound) => {
                            drawn.push(bound);
                            return 1;
                        },
                        world: { players: () => [], mobs: () => [] }
                    });
                    gameTicks(probe, 1);
                    return drawn[0];
                });
                // `randomInterval` 0 skips the draw: NearestAttackableTargetGoal.canUse scans every selector tick.
                const expected = interval > 0 ? reducedTickDelay(interval) : undefined;
                if (bounds.some((bound) => bound !== expected)) {
                    differences.push(
                        `it scans for a target ${bounds.map((bound) => (bound === undefined ? 'on a fixed cooldown' : `on one selector tick in ${bound}`)).join(' or ')}, where Java's scans ${expected === undefined ? 'on every one' : `on one in ${expected}`}`
                    );
                }
            }
            return differences;
        }
    },
    {
        aspect: 'hurt_by_target',
        javaClasses: ['HurtByTargetGoal'],
        java: 'A mob that is hurt targets its attacker unless the attacker is one of the classes it ignores, and with setAlertOthers it calls nearby mobs of its type onto the attacker.',
        reference:
            "Java HurtByTargetGoal.canUse and alertOthers, and each mob's ignore and alert classes read from the pinned jar",
        compare: (subject, { body }, java) => {
            const component = `${PREFIX}hurt_by_target`;
            const ignored = java.params.get('ignoreDamageFromTheseTypes');
            const ignores = (javaId: string): boolean =>
                ignored?.kind === 'array' &&
                ignored.items.some((value) =>
                    value.kind === 'call' && value.method.name === 'getClass'
                        ? javaId === subject.javaId
                        : javaIsA(javaId, value)
                );
            const missing: string[] = [];
            const extra: string[] = [];
            let lookedForAllies = false;
            for (const candidate of [PLAYER, ...candidates().filter((entry) => entry.javaId !== PLAYER.javaId)]) {
                const mob = candidateMob(candidate, { x: 2, y: 0, z: 0 });
                let chosen: GoalMob | undefined;
                const probe = probeGoal(component, body, {
                    random: () => 0,
                    randomInt: () => 0,
                    world: {
                        damagers: () => [{ mob, cause: 'entity_attack', total: 1 }],
                        target: () => chosen,
                        setTarget: (next) => {
                            chosen = next;
                        },
                        mobs: () => {
                            lookedForAllies = true;
                            return [];
                        }
                    }
                });
                gameTicks(probe, 1);
                const server = chosen?.id === mob.id;
                const javaRetaliates = !ignores(candidate.javaId);
                if (javaRetaliates && !server) missing.push(candidate.javaId);
                if (!javaRetaliates && server) extra.push(candidate.javaId);
            }
            const differences: string[] = [];
            if (missing.length > 0) differences.push(`it does not strike back at ${names(missing)}, which Java's does`);
            if (extra.length > 0) differences.push(`it strikes back at ${names(extra)}, which Java's ignores`);
            const alerts = java.calls.some((call) => call.name === 'setAlertOthers');
            if (alerts && !lookedForAllies)
                differences.push('it never calls nearby mobs of its type onto the attacker, which Java does');
            return differences;
        }
    },
    {
        aspect: 'panic',
        javaClasses: ['PanicGoal'],
        java: "A mob panics at its PanicGoal speed when a damage type in its panic tag hurts it, the default being Java's panic_causes tag, which a mob's hit is in and a fall is not.",
        reference:
            "Java PanicGoal.shouldPanic and canUse, the damage_type tag panic_causes, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const component = `${PREFIX}panic`;
            const differences: string[] = [];
            const zombie = candidates().find((entry) => entry.javaId === 'minecraft:zombie');
            const hit = (cause: string, mob: GoalMob | undefined): ReturnType<typeof probeGoal> => {
                const probe = probeGoal(component, declared.body, {
                    random: () => 0.5,
                    randomInt: () => 0,
                    world: { damagers: () => [{ mob, cause, total: 1 }] }
                });
                gameTicks(probe, 2);
                return probe;
            };
            // A mob's own panic goal that overrides shouldPanic, or a damage predicate of the mob's
            // own, may refuse a mob's hit, but every Java panic takes fire.
            const causes = java.params.get('panicCausingDamageTypes');
            const defaultCauses = causes?.kind === 'lambda' && causes.target?.owner === javaGoalClass('PanicGoal');
            // A polar bear's lambda picks panic_environmental_causes for an adult, which fire is in and a hit is not.
            const ownPanic =
                !defaultCauses ||
                (java.classes[0] !== java.goal &&
                    javaMobGoalClass(subject.javaId, java.classes[0] ?? '')?.methods.some(
                        (method) => method.name === 'shouldPanic'
                    ) === true);
            const attacked = ownPanic
                ? hit('fire', undefined)
                : hit('entity_attack', zombie === undefined ? undefined : candidateMob(zombie, { x: 2, y: 0, z: 0 }));
            const speed = speedDifference(
                subject,
                declared,
                'its panic',
                walkSpeeds(attacked)[0],
                param(java, 'speedModifier')
            );
            if (speed !== undefined)
                differences.push(
                    speed.replace('never walks', ownPanic ? 'never panics in fire' : 'never panics when a mob hits it')
                );
            if (
                defaultCauses &&
                !serverContent().tags.members('damage_type', 'minecraft:panic_causes').includes('minecraft:fall')
            ) {
                if (walkSpeeds(hit('fall', undefined)).length > 0)
                    differences.push("it panics after a fall, which is not in Java's panic_causes");
            }
            return differences;
        }
    },
    {
        aspect: 'tempt',
        javaClasses: ['TemptGoal'],
        java: "A mob follows a player within its tempt_range attribute who holds an item its TemptGoal accepts, at the goal's speed.",
        reference:
            "Java TemptGoal.canUse and each mob's tempt item predicate, read from the pinned jar, with the tempt_range attribute from the Java attribute dump",
        compareAll: (subject, declared, java) => {
            const component = `${PREFIX}tempt`;
            const entityClass = javaEntityClass(subject.javaId) ?? '';
            const javaItems = new Set(java.flatMap((goal) => [...javaItemsOf(goal.params.get('items'), entityClass)]));
            const differences: string[] = [];
            const radii: number[] = [];
            const tempted = (body: unknown, item: string, distance: number): ReturnType<typeof probeGoal> => {
                const player = playerAt({ x: distance, y: 0, z: 0 }, item);
                const probe = probeGoal(component, body, {
                    world: {
                        players: (radius) => {
                            radii.push(radius);
                            return [player];
                        }
                    }
                });
                gameTicks(probe, 2);
                return probe;
            };
            const probed = new Set([...javaItems, ...declared.flatMap(({ body }) => bodyItems(body, 'items'))]);
            const serverItems = new Set(
                [...probed].filter((item) => declared.some(({ body }) => tempted(body, item, 3).isRunning(component)))
            );
            const missing = [...javaItems].filter((item) => !serverItems.has(item));
            const extra = [...serverItems].filter((item) => !javaItems.has(item));
            if (javaItems.size === 0) differences.push("Java's tempt items could not be read from its predicate");
            if (missing.length > 0) differences.push(`${names(missing)} do not tempt it, which tempt Java's`);
            if (extra.length > 0) differences.push(`${names(extra)} tempt it, which do not tempt Java's`);
            const range = javaAttribute(subject.javaId, 'minecraft:tempt_range');
            const radius = radii.length === 0 ? undefined : Math.max(...radii);
            if (range !== undefined && (radius === undefined || !close(radius, range)))
                differences.push(
                    `it notices a tempting player within ${show(radius)} blocks, where Java's tempt range is ${show(range)}`
                );
            const [item] = javaItems;
            if (item !== undefined) {
                // Java's goal stops within its stopDistance, such as a happy ghast's 7 blocks, so the
                // player stands beyond it.
                const away = Math.max(6, ...java.map((goal) => (param(goal, 'stopDistance') ?? 0) + 2));
                const speeds = declared.map((body) => {
                    const speed = walkSpeeds(tempted(body.body, item, away))[0];
                    const options = java.map((goal) =>
                        speedDifference(subject, body, 'tempted, it', speed, param(goal, 'speedModifier'))
                    );
                    return options.includes(undefined) ? undefined : options[0];
                });
                for (const speed of speeds) if (speed !== undefined) differences.push(speed);
            }
            return differences;
        }
    },
    {
        aspect: 'melee_box_attack',
        javaClasses: ['MeleeAttackGoal'],
        java: 'A mob chases its target at its MeleeAttackGoal speed and swings once every adjustedTickDelay(20) ticks while in reach.',
        reference:
            "Java MeleeAttackGoal.start, checkAndPerformAttack and resetAttackCooldown, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const component = `${PREFIX}melee_box_attack`;
            const differences: string[] = [];
            const far = candidateMob(PLAYER, { x: 6, y: 0, z: 0 });
            const chase = probeGoal(component, declared.body, { random: () => 0.99, world: { target: () => far } });
            const speed = speedDifference(
                subject,
                declared,
                'its chase',
                firstWalk(chase, 1),
                param(java, 'speedModifier')
            );
            if (speed !== undefined) differences.push(speed);
            const near = candidateMob(PLAYER, { x: 0.5, y: 0, z: 0 });
            const swings: number[] = [];
            let tick = 0;
            const fight = probeGoal(component, declared.body, {
                random: () => 0.99,
                world: { target: () => near, attack: () => swings.push(tick) }
            });
            for (; tick < 80; tick++) fight.entity.goals.tick(tick % 2 === 0);
            const [cooldown] = javaMethodNumbers(javaGoalClass('MeleeAttackGoal'), 'resetAttackCooldown');
            // A goal that attacks once, as a bee's sting does, has no swing cadence to compare.
            if (field(declared.body, 'attack_once') === true) return differences;
            const gap = swings.length < 2 ? undefined : (swings[1] ?? 0) - (swings[0] ?? 0);
            if (cooldown !== undefined && (gap === undefined || Math.abs(gap - cooldown) > 1))
                differences.push(
                    `it swings every ${gap === undefined ? 'never' : `${gap} ticks`}, where Java's swings every ${cooldown}`
                );
            return differences;
        }
    },
    {
        aspect: 'avoid_mob_type',
        javaClasses: ['AvoidEntityGoal'],
        java: 'A mob flees from the classes its AvoidEntityGoals name once one is within maxDist, walking at walkSpeedModifier and sprinting at sprintSpeedModifier when the threat is within 7 blocks.',
        reference:
            "Java AvoidEntityGoal.canUse and tick, and each mob's avoid classes, distances and speeds read from the pinned jar",
        compareAll: (subject, declared, java) => {
            const component = `${PREFIX}avoid_mob_type`;
            const flees = (candidate: Candidate, distance: number): number | undefined => {
                const isPlayer = candidate.javaId === PLAYER.javaId;
                const mob = candidateMob(candidate, { x: distance, y: 0, z: 0 });
                for (const { body } of declared) {
                    const probe = probeGoal(component, body, { random: () => 0, world: offering(mob, isPlayer) });
                    const speed = firstWalk(probe, 1);
                    if (speed !== undefined) return speed;
                }
                return undefined;
            };
            const javaAvoided = new Set<string>();
            const required = new Set<string>();
            for (const goal of java) {
                for (const candidate of candidates()) {
                    if (!javaIsA(candidate.javaId, goal.params.get('avoidClass'))) continue;
                    javaAvoided.add(candidate.javaId);
                    if (!narrowed(goal, 'avoidPredicate', 'predicateOnAvoidEntity')) required.add(candidate.javaId);
                }
            }
            const serverAvoided = new Set(
                candidates()
                    .filter((candidate) => flees(candidate, 2.5) !== undefined)
                    .map((candidate) => candidate.javaId)
            );
            const differences: string[] = [];
            const missing = [...required].filter((javaId) => !serverAvoided.has(javaId));
            const extra = [...serverAvoided].filter((javaId) => !javaAvoided.has(javaId));
            if (missing.length > 0) differences.push(`it does not flee from ${names(missing)}, which Java's flees`);
            if (extra.length > 0) differences.push(`it flees from ${names(extra)}, which Java's does not`);
            for (const goal of java) {
                const threat = candidates().find(
                    (candidate) =>
                        javaIsA(candidate.javaId, goal.params.get('avoidClass')) && serverAvoided.has(candidate.javaId)
                );
                const maxDist = param(goal, 'maxDist');
                if (threat === undefined || maxDist === undefined) continue;
                const label = threat.javaId.replace('minecraft:', '');
                if (flees(threat, maxDist - 0.5) === undefined || flees(threat, maxDist + 1) !== undefined)
                    differences.push(
                        `it flees a ${label} from a different distance than Java's ${show(maxDist)} blocks`
                    );
                const sprint = speedDifference(
                    subject,
                    declared[0] ?? { body: {}, movement: undefined },
                    `fleeing a close ${label}`,
                    flees(threat, 2.5),
                    param(goal, 'sprintSpeedModifier')
                );
                if (sprint !== undefined) differences.push(sprint);
                if (maxDist > 8) {
                    const walk = speedDifference(
                        subject,
                        declared[0] ?? { body: {}, movement: undefined },
                        `fleeing a ${label} 7.5 blocks off`,
                        flees(threat, 7.5),
                        param(goal, 'walkSpeedModifier')
                    );
                    if (walk !== undefined) differences.push(walk);
                }
            }
            return differences;
        }
    },
    {
        aspect: 'breed',
        javaClasses: ['BreedGoal'],
        java: 'An animal in love walks to a partner within 8 blocks at its BreedGoal speed.',
        reference: "Java BreedGoal.canUse and tick, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const partner = candidateMob(PLAYER, { x: 4, y: 0, z: 0 });
            const probe = probeGoal(`${PREFIX}breed`, declared.body, {
                world: { mobs: () => [partner], canBreedWith: () => true, isReadyToBreed: () => true }
            });
            const speed = speedDifference(
                subject,
                declared,
                'courting, it',
                firstWalk(probe, 2),
                param(java, 'speedModifier')
            );
            return speed === undefined ? [] : [speed];
        }
    },
    {
        aspect: 'follow_parent',
        javaClasses: ['FollowParentGoal'],
        java: 'A baby walks to an adult of its type that is 3 or more blocks away, at its FollowParentGoal speed.',
        reference: "Java FollowParentGoal.canUse and tick, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const component = `${PREFIX}follow_parent`;
            const parentAt = (distance: number): GoalMob => ({
                id: 'parent',
                position: () => ({ x: distance, y: 0, z: 0 }),
                view: () => ({ id: () => 'parent', flag: (name) => (name === 'is_baby' ? false : undefined) }),
                identifier: () => PROBE_IDENTIFIER
            });
            const follows = (distance: number): ReturnType<typeof probeGoal> => {
                const parent = parentAt(distance);
                const probe = probeGoal(component, declared.body, {
                    components: { 'minecraft:is_baby': {} },
                    world: { mobs: () => [parent] }
                });
                gameTicks(probe, 2);
                return probe;
            };
            const differences: string[] = [];
            if (follows(2.5).isRunning(component))
                differences.push('it follows a parent closer than 3 blocks, which Java does not');
            const speed = speedDifference(
                subject,
                declared,
                'following its parent, it',
                walkSpeeds(follows(6))[0],
                param(java, 'speedModifier')
            );
            if (speed !== undefined) differences.push(speed);
            return differences;
        }
    },
    {
        aspect: 'ranged_attack',
        javaClasses: ['RangedAttackGoal', 'RangedBowAttackGoal', 'RangedCrossbowAttackGoal'],
        java: 'A ranged mob walks toward its target at its goal speed until the target is within its attack radius, then holds its ground and shoots.',
        reference:
            "Java RangedAttackGoal, RangedBowAttackGoal and RangedCrossbowAttackGoal tick, and each mob's radius and speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const component = `${PREFIX}ranged_attack`;
            const radius = param(java, 'attackRadius');
            if (radius === undefined) return [];
            const approaches = (distance: number): number | undefined => {
                const target = candidateMob(PLAYER, { x: distance, y: 0, z: 0 });
                return firstWalk(probeGoal(component, declared.body, { world: { target: () => target } }), 3);
            };
            const differences: string[] = [];
            const outside = approaches(radius + 2);
            if (outside === undefined || approaches(radius - 2) !== undefined)
                differences.push(`it closes in to a different range than Java's ${show(radius)} block attack radius`);
            const speed = speedDifference(subject, declared, 'closing in, it', outside, param(java, 'speedModifier'));
            if (speed !== undefined) differences.push(speed);
            return differences;
        }
    },
    {
        aspect: 'random_swim',
        javaClasses: ['RandomSwimmingGoal'],
        java: 'A swimming mob starts a swim on one selector tick in reducedTickDelay(interval) and swims at its goal speed.',
        reference:
            "Java RandomSwimmingGoal, which extends RandomStrollGoal, and each mob's interval and speed read from the pinned jar",
        compare: (subject, declared, java) =>
            strollDifferences(subject, declared, java, `${PREFIX}random_swim`, 'a swim', { in_water: true })
    },
    {
        aspect: 'swim_wander',
        javaClasses: ['RandomSwimmingGoal'],
        java: 'A fish starts a swim on one selector tick in reducedTickDelay(interval) of its swim goal and swims at its goal speed.',
        reference: 'Java AbstractFish.FishSwimGoal, a RandomSwimmingGoal with interval 40, read from the pinned jar',
        compare: (subject, declared, java) => {
            const component = `${PREFIX}swim_wander`;
            const interval = param(java, 'interval');
            if (interval === undefined) return [];
            const differences: string[] = [];
            const chance = startChance(component, declared.body, { flags: { in_water: true } });
            const expected = 1 / reducedTickDelay(interval);
            if (!close(chance, expected, 0.05))
                differences.push(
                    `a swim starts on a ${show(chance)} chance per selector tick, where Java's starts on ${show(expected)}`
                );
            const probe = probeGoal(component, declared.body, { flags: { in_water: true }, random: () => 0 });
            const speed = speedDifference(
                subject,
                declared,
                'a swim',
                firstWalk(probe, 1),
                param(java, 'speedModifier')
            );
            if (speed !== undefined) differences.push(speed);
            return differences;
        }
    },
    {
        aspect: 'flee_sun',
        javaClasses: ['FleeSunGoal'],
        java: 'A burning mob under open sky with no target and nothing on its head walks to shade at its FleeSunGoal speed.',
        reference: "Java FleeSunGoal.canUse, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const probe = probeGoal(`${PREFIX}flee_sun`, declared.body, {
                components: { 'minecraft:navigation.walk': {}, 'minecraft:movement.basic': {} },
                flags: { on_fire: true },
                random: () => 0.5,
                // FleeSunGoal draws 20 across and 6 up; this lands nine blocks off at the same height.
                randomInt: (bound) => (bound === 6 ? 3 : bound - 1),
                world: { isBrightOutside: () => true, navigation: () => FLAT_SHADE }
            });
            const speed = speedDifference(
                subject,
                declared,
                'fleeing the sun, it',
                firstWalk(probe, 2),
                param(java, 'speedModifier')
            );
            return speed === undefined ? [] : [speed];
        }
    },
    {
        aspect: 'run_around_like_crazy',
        javaClasses: ['RunAroundLikeCrazyGoal'],
        java: 'An untamed horse with a rider bucks around at its RunAroundLikeCrazyGoal speed.',
        reference: "Java RunAroundLikeCrazyGoal.canUse, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const rider = playerAt({ x: 0, y: 1, z: 0 });
            const probe = probeGoal(`${PREFIX}run_around_like_crazy`, declared.body, {
                random: () => 0.5,
                world: { riders: () => [rider] }
            });
            const speed = speedDifference(
                subject,
                declared,
                'bucking, it',
                firstWalk(probe, 2),
                param(java, 'speedModifier')
            );
            return speed === undefined ? [] : [speed];
        }
    },
    {
        aspect: 'follow_owner',
        javaClasses: ['FollowOwnerGoal'],
        java: 'A tamed mob starts following its owner once the owner is startDistance blocks away and stops within stopDistance, at its FollowOwnerGoal speed.',
        reference:
            "Java FollowOwnerGoal.canUse and canContinueToUse, and each mob's distances and speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const component = `${PREFIX}follow_owner`;
            const start = param(java, 'startDistance');
            const stop = param(java, 'stopDistance');
            if (start === undefined || stop === undefined) return [];
            const differences: string[] = [];
            const follow = (distance: number): ReturnType<typeof probeGoal> => {
                const owner = playerAt({ x: distance, y: 0, z: 0 });
                const probe = probeGoal(component, declared.body, { follow: false, world: { owner: () => owner } });
                gameTicks(probe, 2);
                return probe;
            };
            const far = follow(start + 0.5);
            if (!far.isRunning(component) || follow(start - 0.5).isRunning(component))
                differences.push(`it starts following at a different distance than Java's ${show(start)} blocks`);
            const speed = speedDifference(
                subject,
                declared,
                'following its owner, it',
                walkSpeeds(far)[0],
                param(java, 'speedModifier')
            );
            if (speed !== undefined) differences.push(speed);
            let at = start + 0.5;
            const owner = { ...playerAt({ x: 0, y: 0, z: 0 }), position: () => ({ x: at, y: 0, z: 0 }) };
            const probe = probeGoal(component, declared.body, { follow: false, world: { owner: () => owner } });
            gameTicks(probe, 2);
            at = stop + 0.5;
            gameTicks(probe, 2);
            const keeps = probe.isRunning(component);
            at = stop - 0.5;
            gameTicks(probe, 2);
            if (!keeps || probe.isRunning(component))
                differences.push(`it stops following at a different distance than Java's ${show(stop)} blocks`);
            return differences;
        }
    },
    {
        aspect: 'teleport_to_owner',
        javaClasses: ['FollowOwnerGoal'],
        java: 'A tamed mob that is following its owner teleports to the owner once it is 12 or more blocks away.',
        reference:
            'Java FollowOwnerGoal.tick and TamableAnimal.shouldTryTeleportToOwner (distanceToSqr >= 144), read from the pinned jar',
        compare: (_subject, { body }) => {
            const [squared] = javaMethodNumbers('net/minecraft/world/entity/TamableAnimal', 'shouldTryTeleportToOwner');
            if (squared === undefined) return [];
            const distance = Math.sqrt(squared);
            const teleports = (at: number): boolean => {
                const owner = playerAt({ x: at, y: 0, z: 0 });
                let moved = false;
                const probe = probeGoal(`${PREFIX}teleport_to_owner`, body, {
                    measures: { owner_distance: at },
                    flags: { is_panicking: false },
                    world: {
                        owner: () => owner,
                        teleportTo: () => {
                            moved = true;
                        }
                    }
                });
                gameTicks(probe, 2);
                return moved;
            };
            return teleports(distance + 1) && !teleports(distance - 1)
                ? []
                : [
                      `it teleports ${teleports(distance + 1) ? 'when closer' : 'not even'} at ${show(distance + 1)} blocks, where Java's teleports from ${show(distance)}`
                  ];
        }
    },
    {
        aspect: 'leap_at_target',
        javaClasses: ['LeapAtTargetGoal'],
        java: 'A mob 2 to 4 blocks from its target leaps on one selector tick in reducedTickDelay(5), with its LeapAtTargetGoal yd as the upward push.',
        reference: "Java LeapAtTargetGoal.canUse and start, and each mob's yd read from the pinned jar",
        compare: (_subject, { body }, java) => {
            const component = `${PREFIX}leap_at_target`;
            const target = candidateMob(PLAYER, { x: 3, y: 0, z: 0 });
            const differences: string[] = [];
            // `canUse` loads 4 and 16 for the distance window, then 5 for `reducedTickDelay(5)`.
            const bound = javaMethodNumbers(javaGoalClass('LeapAtTargetGoal'), 'canUse')
                .filter((value) => Number.isInteger(value) && value >= 2 && value !== 4 && value !== 16)
                .at(-1);
            const chance = startChance(component, body, {
                flags: { on_ground: true },
                world: { target: () => target }
            });
            if (bound !== undefined && !close(chance, 1 / reducedTickDelay(bound), 0.05))
                differences.push(
                    `a leap starts on a ${show(chance)} chance per selector tick, where Java's starts on ${show(1 / reducedTickDelay(bound))}`
                );
            const pushes: number[] = [];
            const probe = probeGoal(component, body, {
                flags: { on_ground: true },
                random: () => 0,
                randomInt: () => 0,
                world: { target: () => target, push: (velocity) => pushes.push(velocity.y) }
            });
            gameTicks(probe, 1);
            const yd = param(java, 'yd');
            if (yd !== undefined && (pushes[0] === undefined || !close(pushes[0], yd)))
                differences.push(`it leaps ${show(pushes[0])} up, where Java's leaps ${show(yd)}`);
            return differences;
        }
    },
    {
        aspect: 'stomp_turtle_egg',
        javaClasses: ['RemoveBlockGoal'],
        java: 'A zombie looks for turtle eggs within its RemoveBlockGoal search range (24 across, 3 up and down) and walks to them at the goal speed.',
        reference:
            'Java Zombie.ZombieAttackTurtleEggGoal, a RemoveBlockGoal over MoveToBlockGoal, read from the pinned jar',
        compare: (subject, declared, java) => {
            const queries: BlockQuery[] = [];
            const probe = probeGoal(`${PREFIX}stomp_turtle_egg`, declared.body, {
                random: () => 0,
                world: {
                    blocks: (query) => {
                        queries.push(query);
                        return [{ position: { x: 4, y: 0, z: 0 }, identifier: 'minecraft:turtle_egg' }];
                    }
                }
            });
            gameTicks(probe, 2);
            const differences: string[] = [];
            const range = param(java, 'searchRange');
            const height = param(java, 'verticalSearchRange');
            const [query] = queries;
            if (range !== undefined && height !== undefined && (query?.range !== range || query.height !== height))
                differences.push(
                    `it searches ${show(query?.range)} across and ${show(query?.height)} up for eggs, where Java's searches ${show(range)} and ${show(height)}`
                );
            const speed = speedDifference(
                subject,
                declared,
                'heading for an egg, it',
                walkSpeeds(probe)[0],
                param(java, 'speedModifier')
            );
            if (speed !== undefined) differences.push(speed);
            return differences;
        }
    },
    {
        aspect: 'use_kinetic_weapon',
        javaClasses: ['SpearUseGoal'],
        java: 'A mob with a target charges it with its spear on foot or mounted, at its SpearUseGoal charging speed.',
        reference: "Java SpearUseGoal.canUse and tick, and each mob's speeds read from the pinned jar",
        compare: (subject, declared, java) => {
            const component = `${PREFIX}use_kinetic_weapon`;
            const target = candidateMob(PLAYER, { x: 6, y: 0, z: 0 });
            const differences: string[] = [];
            const onFoot = probeGoal(component, declared.body, { world: { target: () => target } });
            gameTicks(onFoot, 2);
            if (!onFoot.isRunning(component))
                differences.push('it only charges while mounted, where Java charges on foot');
            const mount = candidateMob(PLAYER, { x: 0, y: -1, z: 0 });
            const mounted = probeGoal(component, declared.body, {
                world: { target: () => target, vehicle: () => mount }
            });
            const speed = speedDifference(
                subject,
                declared,
                'charging, it',
                firstWalk(mounted, 2),
                param(java, 'speedModifierWhenCharging')
            );
            if (speed !== undefined) differences.push(speed);
            return differences;
        }
    },
    {
        aspect: 'move_towards_home_restriction',
        javaClasses: ['MoveTowardsRestrictionGoal'],
        java: 'A mob outside its home restriction walks back toward it at its MoveTowardsRestrictionGoal speed.',
        reference: "Java MoveTowardsRestrictionGoal.canUse, and each mob's speed read from the pinned jar",
        compare: (subject, declared, java) => {
            const probe = probeGoal(`${PREFIX}move_towards_home_restriction`, declared.body, {
                world: { home: () => ({ x: 20, y: 0, z: 0 }) }
            });
            const speed = speedDifference(
                subject,
                declared,
                'heading home, it',
                firstWalk(probe, 2),
                param(java, 'moveSpeedModifier')
            );
            return speed === undefined ? [] : [speed];
        }
    },
    {
        aspect: 'stay_while_sitting',
        javaClasses: ['SitWhenOrderedToGoal'],
        java: 'A sitting tamed mob holds both the move and the jump flags, so nothing walks or jumps it.',
        reference:
            'Java SitWhenOrderedToGoal, whose constructor sets the JUMP and MOVE flags, read from the pinned jar',
        compare: (_subject, { body }, java) => {
            const component = `${PREFIX}stay_while_sitting`;
            const sitting = probeGoal(component, body, { flags: { is_sitting: true } });
            gameTicks(sitting, 1);
            const standing = probeGoal(component, body, { flags: { is_sitting: false } });
            gameTicks(standing, 1);
            const differences: string[] = [];
            if (!sitting.isRunning(component) || standing.isRunning(component))
                differences.push('it does not hold still exactly while sitting');
            const flags = java.calls.find((call) => call.name === 'setFlags')?.args[0];
            const javaFlags =
                flags?.kind === 'call'
                    ? flags.args.flatMap((arg) => (arg.kind === 'field' ? [arg.field.name.toLowerCase()] : []))
                    : [];
            for (const flag of javaFlags) {
                if (flag !== 'move' && flag !== 'jump') continue;
                if (sitting.entity.goals.holderOf(flag) !== component)
                    differences.push(`sitting does not hold the ${flag} flag, which Java's goal holds`);
            }
            return differences;
        }
    },
    {
        aspect: 'celebrate',
        javaClasses: ['Raider$RaiderCelebration'],
        java: 'A celebrating raider jumps on a 1 in 50 draw per selector tick, about once every 100 game ticks.',
        reference: 'Java Raider.RaiderCelebration.tick, read from the pinned jar',
        compare: (_subject, { body }) => {
            const component = `${PREFIX}celebrate`;
            const [, jumpBound] = javaMethodNumbers('net/minecraft/world/entity/raid/Raider$RaiderCelebration', 'tick');
            if (jumpBound === undefined) return [];
            const probe = probeGoal(component, body, { random: () => 0.5 });
            let ticks = 0;
            for (; ticks < 4000; ticks++) {
                probe.entity.goals.tick(ticks % 2 === 0);
                if (ticks > 0 && !probe.isRunning(component)) break;
            }
            const jumps = probe.actuator.count('jump');
            const javaMean = 2 * jumpBound;
            const serverMean = jumps === 0 ? Number.POSITIVE_INFINITY : ticks / jumps;
            return close(serverMean, javaMean, 0.25)
                ? []
                : [`it jumps about every ${show(serverMean)} game ticks, where Java's jumps about every ${javaMean}`];
        }
    },
    {
        aspect: 'move_to_village',
        javaClasses: ['PathfindToRaidGoal'],
        java: "A raider walks toward its raid's center at speed 1.0.",
        reference:
            'Java PathfindToRaidGoal.tick, which calls PathNavigation.moveTo with a speed of 1.0, read from the pinned jar',
        compare: (subject, declared) => {
            const numbers = javaMethodNumbers(javaGoalClass('PathfindToRaidGoal'), 'tick');
            const probe = probeGoal(`${PREFIX}move_to_village`, declared.body, {
                world: { poi: () => ({ x: 30, y: 0, z: 0 }) }
            });
            const speed = speedDifference(
                subject,
                declared,
                'heading for the village, it',
                firstWalk(probe, 2),
                numbers.at(-1)
            );
            return speed === undefined ? [] : [speed];
        }
    },
    {
        aspect: 'move_to_water',
        javaClasses: ['TryFindWaterGoal', 'TryFindLiquidGoal', 'Turtle$TurtleGoToWaterGoal'],
        java: "A mob on land looks for water within its goal's search range and walks there.",
        reference: 'Java TryFindWaterGoal, TryFindLiquidGoal and Turtle.TurtleGoToWaterGoal, read from the pinned jar',
        compare: (subject, declared, java) => {
            const queries: BlockQuery[] = [];
            const probe = probeGoal(`${PREFIX}move_to_water`, declared.body, {
                random: () => 0,
                randomInt: () => 0,
                world: {
                    blocks: (query) => {
                        queries.push(query);
                        return [{ position: { x: 3, y: 0, z: 0 }, identifier: 'minecraft:water' }];
                    }
                }
            });
            gameTicks(probe, 2);
            const differences: string[] = [];
            // TryFindWaterGoal and TryFindLiquidGoal scan the blocks around the mob, one block out.
            const range = param(java, 'searchRange') ?? 1;
            const [query] = queries;
            if (query === undefined || query.range !== range)
                differences.push(
                    `it looks for water ${show(query?.range)} blocks out, where Java's looks ${show(range)}`
                );
            const speed = speedDifference(
                subject,
                declared,
                'heading for water, it',
                walkSpeeds(probe)[0],
                param(java, 'speedModifier') ?? 1
            );
            if (speed !== undefined) differences.push(speed);
            return differences;
        }
    },
    {
        aspect: 'pickup_items',
        javaClasses: [],
        java: 'A Java mob picks up loot only when it can pick up loot, and then only what it touches, unless a goal of its own, such as the fox searching for items, walks it to an item.',
        reference:
            'Java Mob.aiStep and pickUpItem, the setCanPickUpLoot calls in each mob class, and Fox.FoxSearchForItemsGoal and Dolphin.PlayWithItemsGoal, read from the pinned jar',
        compareAll: (subject, declared) => {
            const component = `${PREFIX}pickup_items`;
            // A raider's ObtainRaidLeaderBannerGoal walks it only to a banner, which `javaLoot` covers.
            const walksToItems = javaGoals(subject.javaId).some((goal) =>
                /SearchForItems|PlayWithItems/.test(goal.goal)
            );
            const [shareables] = componentValues(subject.bedrock, 'minecraft:shareables');
            const loot = javaLoot(subject.javaId);
            const acts = (distance: number): { readonly walks: boolean; readonly takes: boolean } => {
                const item = {
                    id: 'item',
                    position: () => ({ x: distance, y: 0, z: 0 }),
                    identifier: () => 'minecraft:iron_sword',
                    count: () => 1
                };
                let takes = false;
                let walks = false;
                for (const { body } of declared) {
                    const probe = probeGoal(component, body, {
                        random: () => 0,
                        follow: false,
                        ...(shareables === undefined ? {} : { components: { 'minecraft:shareables': shareables } }),
                        world: { items: () => [item], pickUp: () => (takes = true) }
                    });
                    gameTicks(probe, 2);
                    walks ||= walkSpeeds(probe).length > 0;
                }
                return { walks, takes: takes || walks };
            };
            const near = acts(0.5);
            const far = acts(2.5);
            const differences: string[] = [];
            // The probe offers an iron sword, which a mob that only takes banners never wants.
            if (loot !== 'any' && !walksToItems && near.takes)
                differences.push(
                    `it picks up an iron sword, which Java's ${loot === 'banners' ? 'leaves for banners' : 'never picks up'}`
                );
            if ((loot === 'any' || walksToItems) && !near.takes)
                differences.push("it does not pick up an item it stands on, which Java's does");
            if (far.walks && !walksToItems)
                differences.push("it walks to an iron sword 2.5 blocks away, which Java's leaves where it lies");
            return differences;
        }
    },
    {
        aspect: 'equip_item',
        javaClasses: [],
        java: 'A Java mob that can pick up loot equips what it picks up, better gear replacing worse.',
        reference:
            'Java Mob.pickUpItem and equipItemIfPossible, and the setCanPickUpLoot calls in each mob class, read from the pinned jar',
        compareAll: (subject, declared) => {
            let equipped = false;
            for (const { body } of declared) {
                const probe = probeGoal(`${PREFIX}equip_item`, body, {
                    world: { inventory: () => ['minecraft:iron_sword'], setCarriedItem: () => (equipped = true) }
                });
                gameTicks(probe, 2);
            }
            // A raider equips only the banner it picks up; any other loot it never holds.
            const javaEquips = javaLoot(subject.javaId) !== 'none';
            if (javaEquips === equipped) return [];
            return [
                javaEquips
                    ? "it does not equip an item it holds, which Java's does"
                    : "it equips items, which Java's never picks up"
            ];
        }
    },
    {
        aspect: 'player_ride_tamed',
        javaClasses: [],
        java: 'A Java mount whose class hands control to its rider stops steering itself while a player rides it.',
        reference:
            'Java Mob.getControllingPassenger and its overrides, such as AbstractHorse.getControllingPassenger, read from the pinned jar',
        compareAll: (subject, declared) => {
            const component = `${PREFIX}player_ride_tamed`;
            const rider = playerAt({ x: 0, y: 1, z: 0 });
            const holds = declared.some(({ body }) => {
                const probe = probeGoal(component, body, {
                    components: { 'minecraft:is_tamed': {} },
                    world: { riders: () => [rider] }
                });
                gameTicks(probe, 1);
                return probe.entity.goals.holderOf('move') === component;
            });
            const entityClass = javaEntityClass(subject.javaId);
            const javaRides =
                entityClass !== undefined &&
                javaSuperChain(entityClass)
                    .filter((name) => !/\/(Mob|LivingEntity|Entity)$/.test(name))
                    .some((name) =>
                        javaClass(name)?.methods.some((method) => method.name === 'getControllingPassenger')
                    );
            if (javaRides === holds) return [];
            return [
                javaRides
                    ? 'a rider does not take over its movement, which Java hands to the rider'
                    : "a rider takes over its movement, which Java's never hands over"
            ];
        }
    },
    ...(
        [
            [
                'mount_pathing',
                'Java has no goal that walks a mount to its target: a mob that rides another steers it through Mob.getControllingPassenger'
            ],
            [
                'find_mount',
                'Java has no goal that walks a mob to a mount: a chicken jockey or spider jockey is assembled when it spawns, in Zombie.finalizeSpawn and Spider.finalizeSpawn'
            ],
            ['swim_idle', 'Java has no idle goal for a fish: it idles between the swims its RandomSwimmingGoal starts'],
            ['timer_flag_1', 'Java runs no timer goal for this mob; its timed states are counters in the mob class']
        ] as const
    ).map(([aspect, java]): GoalComparison => ({
        aspect,
        javaClasses: [],
        java,
        reference: "The mob's registerGoals in the pinned jar, which registers no goal of this kind",
        compareAll: (subject) => [
            `${java.replace(/^Java has no/, "Java's " + subject.javaId.replace('minecraft:', '') + ' has no')}, but the server runs ${PREFIX}${aspect}`
        ]
    }))
];

/** The brain mobs whose Bedrock goals in this theme the server must leave idle, with what each spawned as. */
const brainProbe = new Map<string, string | undefined>();

/**
 * Spawns a brain mob in the live entity runtime and reports what differs from a Java brain mob:
 * the server builds no goal world for it, attaches its brain, and runs none of its Bedrock goals.
 */
const brainDifference = (subject: EntitySubject): string | undefined => {
    if (brainProbe.has(subject.bedrock)) return brainProbe.get(subject.bedrock);
    const { runtime } = realStack();
    const entity = runtime.spawn(subject.bedrock, { x: 0.5, y: 64, z: 0.5 });
    let difference: string | undefined;
    if (entity === undefined) difference = `the server cannot spawn ${subject.bedrock}`;
    else {
        const running = new Set<string>();
        for (let tick = 0; tick < 40; tick++) {
            runtime.tick(tick);
            for (const goal of entity.instance.goals.runningGoals()) running.add(goal);
        }
        if (entity.brain === undefined) difference = 'the server attaches no brain to it';
        else if (entity.runsGoals || runtime.goalWorldFor(entity.instance) !== undefined)
            difference = 'the server runs its Bedrock goals beside its brain';
        else if (running.size > 0) difference = `the server ran ${[...running].sort().join(', ')}`;
        runtime.remove(entity.id, 'parity probe');
    }
    brainProbe.set(subject.bedrock, difference);
    return difference;
};

/**
 * Whether a Java mob builds a brain: some class it extends, short of `LivingEntity` which holds
 * the empty base, overrides `brainProvider` or `makeBrain`.
 */
const javaHasBrain = (javaId: string): boolean => {
    const entityClass = javaEntityClass(javaId);
    if (entityClass === undefined) return false;
    return javaSuperChain(entityClass)
        .filter((name) => !name.endsWith('/LivingEntity'))
        .some((name) =>
            javaClass(name)?.methods.some((method) => method.name === 'brainProvider' || method.name === 'makeBrain')
        );
};

/** The shared-goal scenarios: one per Bedrock goal this theme compares, and the brain mobs' check. */
export const goalScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'brain-runs-instead',
        java: "A mob whose Java class builds a Brain registers no goals: its brain's sensors and behaviors decide what it looks at, follows, flees and attacks.",
        reference:
            "Java LivingEntity.brainProvider overrides, read from the pinned jar, and each brain mob's empty goal selector",
        subjects: () =>
            THEME_GOALS.flatMap((aspect) =>
                entitiesDeclaring(`${PREFIX}${aspect}`)
                    .filter((subject) => brainOnly(subject))
                    .map((subject) => ({ ...subject, tag: `${PREFIX}${aspect}` }))
            ),
        idOf: (subject) => `${subject.javaId}/${subject.tag ?? ''}`,
        covers: (subject) => subject.javaId,
        classify: goalGap(
            "A mob whose Java class builds a Brain runs its brain's behaviors, and only the goals its class registers beside it."
        ),
        aspects: (subject) => [subject.tag ?? ''],
        run: (subject) => {
            if (!javaHasBrain(subject.javaId))
                return `Java's ${subject.javaId} builds no brain, so the server's brain stands in for no Java AI`;
            const classes =
                comparisons.find((comparison) => `${PREFIX}${comparison.aspect}` === subject.tag)?.javaClasses ?? [];
            const beside = javaGoals(subject.javaId).filter((goal) => isGoal(goal, classes));
            if (beside.length > 0) {
                return `Java's ${subject.javaId} runs ${[...new Set(beside.map((goal) => goal.classes[0]))].join(', ')} beside its brain, which the server leaves out`;
            }
            return brainDifference(subject);
        }
    },
    ...comparisons.map(goalScenario)
];
