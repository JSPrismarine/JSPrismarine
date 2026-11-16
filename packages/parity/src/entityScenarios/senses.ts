import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import type { ResolvedComponentGroup } from '@jsprismarine/entities/entityType';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { serverContent } from '../serverStack.ts';
import type { JavaMethod, JavaOperation } from '../javaClassFile.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import {
    javaClassChain,
    javaEntityClassName,
    javaFireImmune,
    javaMethodOf,
    numberNear,
    pushedNumbers
} from './javaEntityCode.ts';
import type { SandboxMedium, SandboxRun } from './sandbox.ts';
import { SANDBOX_ORIGIN, inSandbox } from './sandbox.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring, mappedEntity } from './subjects.ts';
import { moodScenarios } from './moods.ts';
import { reactionScenarios } from './reactions.ts';

/**
 * Senses, round two: what an entity notices about where it is and what happens to it, and what it
 * does about it. Every scenario runs the server's entity runtime in the shared stack's sandbox and
 * reads the Java side from the pinned jar.
 */

/** Every declared method of a Java class by name, nearest declaration first. */
const javaMethodNamed = (className: string, method: string): JavaMethod => {
    const found = javaMethodOf(className, method);
    if (found === undefined) throw new Error(`${className} declares no ${method}`);
    return found.method;
};

/** The subjects for a list of Java entity types the server runs. */
const subjectsOf = (javaIds: readonly string[]): readonly EntitySubject[] =>
    javaIds.flatMap((javaId) => mappedEntity(javaId) ?? []);

/** The Bedrock identifier a Java entity type spawns as. */
const bedrockOf = (javaId: string): string => {
    const mapped = javaEntityTypeToBedrock(javaId);
    return mapped.kind === 'mapped' ? mapped.bedrock : javaId;
};

/** The first component group of a server type that declares a component, an adult's before a baby's. */
const groupDeclaring = (groups: ReadonlyMap<string, ResolvedComponentGroup>, component: string): string | undefined => {
    const declaring = [...groups.values()].filter((group) =>
        group.components.some((bound) => bound.name === component)
    );
    return (declaring.find((group) => !group.name.includes('baby')) ?? declaring[0])?.name;
};

/** Adds the component group a server type keeps a component in, the way the group's event would. */
const activateComponent = (sandbox: SandboxRun, component: string): boolean => {
    const { instance } = sandbox.entity;
    if (instance.hasComponent(component)) return true;
    const group = groupDeclaring(instance.type.groups, component);
    if (group === undefined) return false;
    instance.restoreComponentGroups([...instance.activeComponentGroups(), group]);
    return instance.hasComponent(component);
};

/** The tick the sandboxed entity left the world on, and what took its place, within `ticks`. */
const replacedWithin = (
    sandbox: SandboxRun,
    ticks: number
): { readonly tick: number; readonly into: readonly string[] } | undefined => {
    for (let tick = 1; tick <= ticks; tick += 1) {
        sandbox.tick(1);
        if (sandbox.stack.runtime.byId(sandbox.entity.id) !== undefined) continue;
        const into = sandbox.stack.runtime
            .near(SANDBOX_ORIGIN, 4)
            .filter((other) => other.id !== sandbox.entity.id)
            .map((other) => other.identifier);
        return { tick, into };
    }
    return undefined;
};

/**
 * The two times of one `ConversionTracker` a Java class builds in its constructor: how long the
 * entity has to stay afflicted, and how long its conversion then runs.
 */
const javaConversionTracker = (className: string): readonly [affliction: number, conversion: number] => {
    const constructors = javaClassChain(className).flatMap((entry) =>
        entry.methods.filter((method) => method.name === '<init>')
    );
    for (const constructor of constructors) {
        const operations = javaOperations(constructor);
        const at = operations.findIndex(
            (operation) => operation.kind === 'call' && operation.target === 'ConversionTracker.<init>'
        );
        if (at < 0) continue;
        const numbers = operations
            .slice(0, at)
            .flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []));
        const [affliction, conversion] = numbers.slice(-2);
        if (affliction !== undefined && conversion !== undefined) return [affliction, conversion];
    }
    throw new Error(`${className} builds no ConversionTracker`);
};

/** The number a Java method compares a counter field with, the first one pushed after the field is read. */
const javaThresholdAfter = (method: JavaMethod, field: string): number => {
    const operations = javaOperations(method);
    const read = operations.findLastIndex(
        (operation) => operation.kind === 'field' && !operation.write && operation.target === field
    );
    const found = operations.slice(read + 1).find((operation) => operation.kind === 'number');
    if (read < 0 || found?.kind !== 'number') throw new Error(`no threshold follows ${field}`);
    return found.value;
};

/** One Java conversion an environment drives. */
interface JavaConversion {
    /** What the sandbox surrounds the entity with. */
    readonly medium: SandboxMedium;
    /** The Java entity type it becomes. */
    readonly into: string;
    /** The tick Java's conversion finishes on, counted from the entity's first tick in the medium. */
    readonly ticks: () => number;
    /** The Java code the times come from. */
    readonly where: string;
}

const trackerTicks = (javaId: string) => () => {
    const [affliction, conversion] = javaConversionTracker(javaEntityClassName(javaId));
    return affliction + conversion + 1;
};

/** The tick Java's overworld timer converts a type on: the first class up its chain whose method counts it. */
const overworldTicks = (javaId: string, method: string) => () => {
    for (const entry of javaClassChain(javaEntityClassName(javaId))) {
        const found = entry.methods.find((candidate) => candidate.name === method);
        const owner = entry.name.slice(entry.name.lastIndexOf('/') + 1);
        const counts = javaOperations(found ?? { instructions: [] }).some(
            (operation) => operation.kind === 'field' && operation.target === `${owner}.timeInOverworld`
        );
        if (found !== undefined && counts) return javaThresholdAfter(found, `${owner}.timeInOverworld`) + 1;
    }
    throw new Error(`no class of ${javaId} counts timeInOverworld in ${method}`);
};

/** The conversions an environment sensor drives, by Java entity type. */
const JAVA_CONVERSIONS: Readonly<Record<string, JavaConversion>> = {
    'minecraft:zombie': {
        medium: 'minecraft:water',
        into: 'minecraft:drowned',
        ticks: trackerTicks('minecraft:zombie'),
        where: 'Zombie.<init> (drowningTracker 600 then 300) and ConversionTracker.tick'
    },
    'minecraft:husk': {
        medium: 'minecraft:water',
        into: 'minecraft:zombie',
        ticks: trackerTicks('minecraft:husk'),
        where: 'Zombie.<init>, Husk.convertsInWater and Husk.doUnderWaterConversion'
    },
    'minecraft:skeleton': {
        medium: 'minecraft:powder_snow',
        into: 'minecraft:stray',
        ticks: trackerTicks('minecraft:skeleton'),
        where: 'Skeleton.<init> (freezingTracker 140 then 300) and ConversionTracker.tick'
    },
    'minecraft:piglin': {
        medium: 'air',
        into: 'minecraft:zombified_piglin',
        ticks: overworldTicks('minecraft:piglin', 'customServerAiStep'),
        where: 'AbstractPiglin.customServerAiStep (timeInOverworld past 300)'
    },
    'minecraft:piglin_brute': {
        medium: 'air',
        into: 'minecraft:zombified_piglin',
        ticks: overworldTicks('minecraft:piglin_brute', 'customServerAiStep'),
        where: 'AbstractPiglin.customServerAiStep (timeInOverworld past 300)'
    },
    'minecraft:hoglin': {
        medium: 'air',
        into: 'minecraft:zoglin',
        ticks: overworldTicks('minecraft:hoglin', 'customServerAiStep'),
        where: 'Hoglin.customServerAiStep (timeInOverworld past 300)'
    }
};

/** How far a conversion may land from Java's tick: Java's tracker counts the tick it starts on. */
const CONVERSION_SLACK = 2;

/** What Java's `canStayRolledUp` lets an armadillo stay rolled up through, read for the probes below. */
const javaArmadilloUnrollsInLiquid = (): boolean =>
    javaMethodNamed(javaEntityClassName('minecraft:armadillo'), 'canStayRolledUp').calls.some((call) =>
        call.endsWith('.isInLiquid')
    );

/** The anger time Java's `NeutralMob` types draw, `TimeUtil.rangeOfSeconds(20, 39)`, in ticks. */
const javaAngerTicks = (javaId: string): readonly [number, number] => {
    for (const entry of [javaEntityClassName(javaId)]) {
        const initializer = pinnedJavaClass(entry).find((method) => method.name === '<clinit>');
        const operations = initializer === undefined ? [] : javaOperations(initializer);
        const at = operations.findIndex(
            (operation) =>
                operation.kind === 'field' && operation.write && operation.target.endsWith('.PERSISTENT_ANGER_TIME')
        );
        const numbers = operations
            .slice(0, at)
            .flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []));
        const [low, high] = numbers.slice(-2);
        if (at >= 0 && low !== undefined && high !== undefined) return [low * 20, high * 20];
    }
    throw new Error(`${javaId} has no PERSISTENT_ANGER_TIME`);
};

/** The Java types that are `NeutralMob`s with a persistent anger time of their own. */
const JAVA_NEUTRAL_MOBS = [
    'minecraft:bee',
    'minecraft:enderman',
    'minecraft:polar_bear',
    'minecraft:wolf',
    'minecraft:zombified_piglin'
];

/**
 * The health each item heals a Java horse or llama by, read from `handleEating`: each branch tests
 * one or more `Items` fields with `ItemStack.is` and then pushes the numbers it assigns, the heal
 * first in `AbstractHorse` and last in `Llama`.
 */
const javaHealTable = (javaId: string): ReadonlyMap<string, number> => {
    const found = javaMethodOf(javaEntityClassName(javaId), 'handleEating');
    if (found === undefined) throw new Error(`${javaId} has no handleEating`);
    const healLast = found.owner === 'Llama';
    const operations = javaOperations(found.method);
    const table = new Map<string, number>();
    operations.forEach((operation, index) => {
        if (operation.kind !== 'field' || !operation.target.startsWith('Items.')) return;
        // Skip the other items the branch tests, then read the numbers it assigns.
        const testsItem = (candidate: JavaOperation | undefined): boolean =>
            candidate?.kind === 'call' || (candidate?.kind === 'field' && candidate.target.startsWith('Items.'));
        let next = index + 1;
        while (testsItem(operations[next])) next += 1;
        const numbers: number[] = [];
        for (let at = next; operations[at]?.kind === 'number'; at += 1) {
            const value = operations[at];
            if (value?.kind === 'number') numbers.push(value.value);
        }
        const heal = healLast ? numbers.at(-1) : numbers[0];
        if (heal !== undefined) table.set(`minecraft:${operation.target.slice('Items.'.length).toLowerCase()}`, heal);
    });
    return table;
};

/** The items a Java type's `isFood` accepts: the members of the item tag the nearest override reads. */
const javaFoods = (javaId: string): readonly string[] => {
    const found = javaMethodOf(javaEntityClassName(javaId), 'isFood');
    const tag = javaOperations(found?.method ?? { instructions: [] }).find(
        (operation) => operation.kind === 'field' && operation.target.startsWith('ItemTags.')
    );
    if (tag?.kind !== 'field') throw new Error(`${javaId} reads no item tag in isFood`);
    return serverContent().tags.members('item', `minecraft:${tag.target.slice('ItemTags.'.length).toLowerCase()}`);
};

/**
 * What one item heals a Java type by when fed: nothing unless `isFood` accepts it, else the
 * amount its `handleEating` branch names, or the one heal a `handleEating` without branches
 * gives every food, as `Camel.handleEating`'s 2 does.
 */
const javaHealOf = (javaId: string, item: string): number => {
    if (!javaFoods(javaId).includes(item)) return 0;
    const table = javaHealTable(javaId);
    if (table.size > 0) return table.get(item) ?? 0;
    const method = javaMethodOf(javaEntityClassName(javaId), 'handleEating')?.method;
    const operations = javaOperations(method ?? { instructions: [] });
    const heal = operations.findIndex((operation) => operation.kind === 'call' && operation.target.endsWith('.heal'));
    const amount = operations
        .slice(0, heal)
        .reverse()
        .find((operation) => operation.kind === 'number');
    return heal >= 0 && amount?.kind === 'number' ? amount.value : 0;
};

/** The Java types `handleEating` heals, whose server definitions declare `minecraft:healable`. */
const JAVA_HEALED_BY_EATING = [
    'minecraft:horse',
    'minecraft:donkey',
    'minecraft:mule',
    'minecraft:zombie_horse',
    'minecraft:llama',
    'minecraft:trader_llama',
    'minecraft:camel',
    'minecraft:camel_husk'
];

/** The player id the healing rows feed from, which the runtime only reads through the view. */
const FEEDER = 7;

/** How many ticks the lava rows watch something sink in a lava pool. */
const LAVA_TICKS = 20;

/** Java's `VehicleEntity.hurtServer`: a vehicle's damage grows by ten a point and destroys it past 40. */
const javaVehicleHitsToBreak = (lava: number): number => {
    const method = javaMethodNamed('net/minecraft/world/entity/vehicle/VehicleEntity', 'hurtServer');
    const numbers = pushedNumbers(method);
    const scale = numbers.find((value) => value === 10) ?? 10;
    const limit = numbers.find((value) => value === 40) ?? 40;
    return Math.floor(limit / (lava * scale)) + 1;
};

/**
 * The tick Java's cushion first checks for lava and fire: `BlockAttachedEntity.tick` never runs
 * `Entity.baseTick`, and runs `tickAtCheckInterval` once its counter, counted up from 0, reaches
 * the interval it compares with.
 */
const javaCushionCheckTick = (): number => {
    const method = javaMethodNamed('net/minecraft/world/entity/decoration/BlockAttachedEntity', 'tick');
    const interval = pushedNumbers(method).find((value) => value > 1);
    if (interval === undefined) throw new Error('BlockAttachedEntity.tick compares its counter with nothing');
    return interval + 1;
};

/** Java's lava blow, `Entity.lavaHurt`. */
const javaLavaDamage = (): number => {
    const method = javaMethodNamed('net/minecraft/world/entity/Entity', 'lavaHurt');
    return pushedNumbers(method).find((value) => value > 1) ?? 4;
};

/**
 * Every flying Java type whose class overrides `isFlapping` and reaches `processFlappingMovement`,
 * which sends the flap game event. `Entity.move` reaches it after each move, except that it returns
 * first for a `noPhysics` entity, which the vex is while `Vex.tick` runs; the ender dragon, also
 * `noPhysics`, calls it from its own `aiStep`.
 */
const javaFlaps = (javaId: string): boolean => {
    const className = javaEntityClassName(javaId);
    const found = javaMethodOf(className, 'isFlapping');
    if (found === undefined || found.owner === 'Entity') return false;
    const flapsItself =
        javaMethodOf(className, 'aiStep')?.method.calls.some((call) => call.endsWith('.processFlappingMovement')) ===
        true;
    const tick = javaMethodOf(className, 'tick');
    const ticksWithoutPhysics =
        tick !== undefined &&
        javaOperations(tick.method).some(
            (operation) => operation.kind === 'field' && operation.write && operation.target.endsWith('.noPhysics')
        );
    return flapsItself || !ticksWithoutPhysics;
};

/**
 * The tick Java first hurts an axolotl or a dolphin stranded on land: an axolotl once its
 * `getMaxAirSupply` has run down to `LivingEntity.shouldTakeDrowningDamage`'s -20, and a dolphin
 * the tick the moisture `Dolphin.tick` refills it to runs out.
 */
const javaFirstDryingHurt = (javaId: string): number => {
    const className = javaEntityClassName(javaId);
    if (javaId === 'minecraft:dolphin') {
        // `Dolphin.tick` refills the moistness to `TOTAL_MOISTNESS_LEVEL` in water, the one constant
        // in the thousands it pushes.
        const moisture = pushedNumbers(javaMethodNamed(className, 'tick')).find((value) => value >= 1000);
        if (moisture === undefined) throw new Error('Dolphin.tick refills no moistness');
        return moisture;
    }
    const air = pushedNumbers(javaMethodNamed(className, 'getMaxAirSupply'))[0] ?? 0;
    const threshold = pushedNumbers(
        javaMethodNamed('net/minecraft/world/entity/LivingEntity', 'shouldTakeDrowningDamage')
    )[0];
    return air - (threshold ?? 0);
};

/** How long the drying rows watch a stranded entity past Java's first blow. */
const DRYING_SLACK = 40;

/**
 * How many ticks the server's first drying blow may trail Java's: each pack event lands on the
 * tick after the one that raised it, and drying passes three, the land sensor's, the timer's and
 * the hurt group's.
 */
const DRYING_EVENT_TICKS = 3;

/** One contact probe: the attacker's component group, the victim beside it, and Java's blow. */
interface ContactProbe {
    readonly group: string;
    readonly victim: string;
    /** The health Java's touch takes off the victim; 0 when Java's touch passes it by. */
    readonly java: () => number;
    readonly why: string;
}

/** Java's `Slime.setSize`: a slime's attack damage is its size, 4 for a big one. */
const BIG_SLIME_SIZE = 4;

/** Java's `Pufferfish.STATE_FULL`, the puff state `Pufferfish.touch` adds to its 1 damage. */
const PUFFERFISH_FULL = 2;

/** The contacts Java's slimes, magma cubes and pufferfish hurt on touch, by Java entity type. */
const JAVA_CONTACTS: Readonly<Record<string, readonly ContactProbe[]>> = {
    'minecraft:slime': [
        {
            group: 'minecraft:slime_large',
            victim: 'minecraft:iron_golem',
            java: () => BIG_SLIME_SIZE,
            why: 'Slime.push deals an iron golem its attack damage, the size'
        },
        {
            group: 'minecraft:slime_large',
            victim: 'minecraft:snow_golem',
            java: () => 0,
            why: 'Slime.push hurts no other mob'
        }
    ],
    'minecraft:magma_cube': [
        {
            group: 'minecraft:slime_large',
            victim: 'minecraft:iron_golem',
            java: () =>
                BIG_SLIME_SIZE +
                (numberNear(
                    javaMethodNamed(javaEntityClassName('minecraft:magma_cube'), 'getAttackDamage'),
                    '.getAttackDamage',
                    'after'
                ) ?? 0),
            why: 'MagmaCube.getAttackDamage adds 2 to the size'
        }
    ],
    'minecraft:pufferfish': [
        {
            group: 'minecraft:full_puff',
            victim: 'minecraft:cow',
            java: () =>
                (numberNear(
                    javaMethodNamed(javaEntityClassName('minecraft:pufferfish'), 'touch'),
                    '.hurtServer',
                    'before'
                ) ?? 0) + PUFFERFISH_FULL,
            why: 'Pufferfish.touch deals a mob 1 plus its puff state'
        }
    ]
};

/** The blocks Java's ravager breaks when it walks into them: the leaves, `LeavesBlock`. */
const RAVAGER_PROBES: readonly { readonly block: string; readonly javaBreaks: boolean }[] = [
    { block: 'minecraft:oak_leaves', javaBreaks: true },
    { block: 'minecraft:melon_block', javaBreaks: false }
];

/** The scenarios of the senses theme. */
export const sensesScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'converts-in-environment',
        java: 'A zombie or a husk under water turns into a drowned or a zombie, a skeleton in powder snow into a stray, and a piglin or a hoglin outside the Nether into its zombified form, each after the time Java counts for it.',
        reference: `Java ${Object.entries(JAVA_CONVERSIONS)
            .map(([javaId, conversion]) => `${javaId}: ${conversion.where}`)
            .join('; ')}, read from the pinned jar`,
        subjects: () => subjectsOf(Object.keys(JAVA_CONVERSIONS)),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const java = JAVA_CONVERSIONS[subject.javaId];
            if (java === undefined) return `no Java conversion is recorded for ${subject.javaId}`;
            const ticks = java.ticks();
            const into = bedrockOf(java.into);
            const replaced = inSandbox(subject.bedrock, java.medium, (sandbox) => replacedWithin(sandbox, ticks + 40));
            if (typeof replaced === 'string') return replaced;
            if (replaced === undefined)
                return `it never converts in ${ticks + 40} ticks, where Java converts it after ${ticks}`;
            const differences: string[] = [];
            if (!replaced.into.includes(into))
                differences.push(`it becomes ${replaced.into.join(', ') || 'nothing'}, where Java makes it ${into}`);
            if (Math.abs(replaced.tick - ticks) > CONVERSION_SLACK)
                differences.push(`it converts after ${replaced.tick} ticks, where Java converts it after ${ticks}`);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'keeps-bow-under-water',
        java: "A skeleton holding its bow keeps its ranged attack under water, since Java's AbstractSkeleton.reassessWeaponGoal picks the goal by the weapon alone, and a pillager keeps its crossbow attack, which Java never swaps for melee.",
        reference:
            'Java AbstractSkeleton.reassessWeaponGoal (Items.BOW decides RangedBowAttackGoal over MeleeAttackGoal) and Pillager.registerGoals (RangedCrossbowAttackGoal only), read from the pinned jar; issue #3176',
        subjects: () =>
            subjectsOf([
                'minecraft:skeleton',
                'minecraft:stray',
                'minecraft:bogged',
                'minecraft:parched',
                'minecraft:pillager'
            ]),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const pillager = subject.javaId === 'minecraft:pillager';
            const reassess = javaMethodOf(
                javaEntityClassName(subject.javaId),
                pillager ? 'registerGoals' : 'reassessWeaponGoal'
            );
            const javaChecksWater = reassess?.method.calls.some((call) => /isInWater|isUnderWater/.test(call));
            if (javaChecksWater === true) return 'Java now reads the water when it picks a weapon goal';
            const ranged = inSandbox(subject.bedrock, 'minecraft:water', (sandbox) => {
                sandbox.tick(5);
                return sandbox.entity.instance.hasComponent('minecraft:behavior.ranged_attack');
            });
            if (typeof ranged === 'string') return ranged;
            return ranged
                ? undefined
                : 'under water the server swaps its ranged attack for melee, which Java never does';
        }
    },
    {
        name: 'armadillo-unrolls-in-water',
        java: "A rolled-up armadillo in water unrolls, since Java's Armadillo.canStayRolledUp refuses a body in liquid.",
        reference:
            'Java Armadillo.canStayRolledUp (isPanicking, isInLiquid, isLeashed, isPassenger, isVehicle), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:armadillo']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const java = javaArmadilloUnrollsInLiquid();
            const rolled = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const { instance } = sandbox.entity;
                const group = 'minecraft:rolled_up';
                sandbox.tick(2);
                instance.raise('minecraft:roll_up', 'self', 'parity');
                sandbox.tick(2);
                if (!instance.activeComponentGroups().includes(group)) return 'the server never rolls it up';
                // Flood the ground it lies on.
                const { x, y, z } = sandbox.entity.position;
                for (const dy of [0, 1])
                    sandbox.stack.world.setBlock(
                        { x: Math.floor(x), y: Math.floor(y) + dy, z: Math.floor(z) },
                        'minecraft:water'
                    );
                sandbox.tick(5);
                return instance.activeComponentGroups().includes(group);
            });
            if (typeof rolled === 'string') return rolled;
            return rolled === !java
                ? undefined
                : `in water it ${rolled ? 'stays rolled up' : 'unrolls'}, where Java ${java ? 'unrolls it' : 'keeps it rolled up'}`;
        }
    },
    {
        name: 'strider-cold-out-of-lava',
        java: "A strider standing on a block that is not warm and out of lava suffocates in the cold, as Java's Strider.tick sets it.",
        reference:
            'Java Strider.tick (BlockTags.STRIDER_WARM_BLOCKS, FluidTags.LAVA, setSuffocating), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:strider']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const javaSetsIt = javaMethodNamed(javaEntityClassName(subject.javaId), 'tick').calls.some((call) =>
                call.endsWith('.setSuffocating')
            );
            if (!javaSetsIt) return "Java's Strider.tick no longer sets the strider suffocating";
            const cold = inSandbox(subject.bedrock, 'air', (sandbox) => {
                sandbox.tick(5);
                return sandbox.entity.instance.activeComponentGroups().some((group) => group.includes('suffocating'));
            });
            if (typeof cold === 'string') return cold;
            return cold
                ? undefined
                : 'on cold glass out of lava the server does not set it suffocating, where Java does';
        }
    },
    {
        name: 'tamed-wolf-health',
        java: "A tamed wolf's maximum health is Java's 40, which Wolf.applyTamingSideEffects sets.",
        reference:
            'Java Wolf.applyTamingSideEffects (MAX_HEALTH 40 when tame, 8 when not), read from the pinned jar; issue #3173',
        subjects: () => subjectsOf(['minecraft:wolf']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const java = pushedNumbers(
                javaMethodNamed(javaEntityClassName(subject.javaId), 'applyTamingSideEffects')
            )[0];
            const max = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const tamed = 'minecraft:wolf_tame';
                if (!sandbox.entity.instance.type.groups.has(tamed)) return `the server type has no ${tamed}`;
                sandbox.entity.instance.restoreComponentGroups([
                    ...sandbox.entity.instance
                        .activeComponentGroups()
                        .filter((group) => group !== 'minecraft:wolf_wild'),
                    tamed
                ]);
                sandbox.tick(3);
                return sandbox.entity.instance.attributes.get('health')?.max;
            });
            if (typeof max === 'string') return max;
            return max === java ? undefined : `tamed, its maximum health is ${String(max)}, where Java's is ${java}`;
        }
    },
    {
        name: 'spider-neutral-in-light',
        java: "A spider or a cave spider in full light picks no target, since Java's SpiderTargetGoal refuses one at a brightness of 0.5 or more.",
        reference:
            'Java Spider$SpiderTargetGoal.canUse (getLightLevelDependentMagicValue >= 0.5), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:spider', 'minecraft:cave_spider']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const hostile = inSandbox(subject.bedrock, 'air', (sandbox) => {
                sandbox.tick(3);
                return sandbox.entity.instance.activeComponentGroups().includes('minecraft:spider_hostile');
            });
            if (typeof hostile === 'string') return hostile;
            return hostile ? 'in full light the server keeps it hostile, where Java picks no target' : undefined;
        }
    },
    {
        name: 'neutral-anger-time',
        java: "An angered neutral mob stays angry for Java's persistent anger time, a draw from 20 to 39 seconds.",
        reference:
            'Java PERSISTENT_ANGER_TIME (TimeUtil.rangeOfSeconds(20, 39)) in Bee, Enderman, PolarBear, Wolf and ZombifiedPiglin, and NeutralMob.startPersistentAngerTimer, read from the pinned jar',
        subjects: () => subjectsOf(JAVA_NEUTRAL_MOBS),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:angry'],
        run: (subject) => {
            const [low, high] = javaAngerTicks(subject.javaId);
            const lasted = inSandbox(subject.bedrock, 'air', (sandbox) => {
                if (!activateComponent(sandbox, 'minecraft:angry'))
                    return 'the server type declares no minecraft:angry';
                for (let tick = 1; tick <= high + 200; tick += 1) {
                    sandbox.tick(1);
                    if (!sandbox.entity.instance.hasComponent('minecraft:angry')) return tick;
                }
                return Number.POSITIVE_INFINITY;
            });
            if (typeof lasted === 'string') return lasted;
            return lasted >= low && lasted <= high + 1
                ? undefined
                : `its anger lasts ${Number.isFinite(lasted) ? `${lasted} ticks` : `past ${high + 200} ticks`}, where Java's lasts ${low} to ${high}`;
        }
    },
    {
        name: 'heals-by-eating',
        java: "A horse, llama or camel fed an item its isFood accepts heals by Java's handleEating amount for it, and nothing else heals it.",
        reference:
            'Java isFood (item tags horse_food, zombie_horse_food, llama_food, camel_food, camel_husk_food), AbstractHorse.handleEating, Llama.handleEating and Camel.handleEating, read from the pinned jar',
        subjects: () => subjectsOf(JAVA_HEALED_BY_EATING),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:healable'],
        run: (subject) => {
            const differences: string[] = [];
            const probes = new Set([...javaFoods(subject.javaId), ...javaHealTable(subject.javaId).keys()]);
            let room = Number.POSITIVE_INFINITY;
            for (const item of probes) {
                const healed = inSandbox(subject.bedrock, 'air', (sandbox) => {
                    const health = sandbox.entity.instance.attributes.get('health');
                    if (health === undefined) return 'it has no health';
                    sandbox.entity.instance.attributes.set('health', 1);
                    room = health.max - 1;
                    sandbox.stack.runtime.interactWithItem(sandbox.entity.id, FEEDER, item, {
                        id: () => FEEDER,
                        flag: () => undefined,
                        names: (name) => (name === 'is_family' ? ['player'] : undefined),
                        equipment: (slot, index) =>
                            slot === 'hand' && (index ?? 0) === 0
                                ? { identifier: () => item, data: () => 0 }
                                : undefined
                    });
                    return (sandbox.entity.instance.attributes.get('health')?.current ?? 1) - 1;
                });
                if (typeof healed === 'string') return healed;
                // A heal past the maximum stops at it, in both editions.
                const expected = Math.min(room, javaHealOf(subject.javaId, item));
                if (Math.abs(healed - expected) > 1e-6)
                    differences.push(`${item} heals it ${healed}, where Java heals ${expected}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'vehicle-in-lava',
        java: "A boat in lava is destroyed once Java's lava blows add past 40 vehicle damage, an arrow is unharmed because Projectile.hurtServer refuses every blow, and a cushion burns away on its first lava check.",
        reference:
            'Java Entity.lavaHurt (lava 4), VehicleEntity.hurtServer (damage grows by 10 a point and destroys past 40), Projectile.hurtServer (no damage), BlockAttachedEntity.tick (checks once its counter reaches 100) and Cushion.tickAtCheckInterval, read from the pinned jar; issue #3174',
        subjects: () =>
            entitiesDeclaring('minecraft:hurt_on_condition')
                .filter(
                    (subject) =>
                        javaFireImmune(subject.javaId) === false &&
                        javaEntityTypeToBedrock(subject.javaId).kind === 'mapped'
                )
                .filter((subject) => /^minecraft:(\w+_(boat|raft)|arrow|cushion)$/.test(subject.javaId)),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:hurt_on_condition'],
        run: (subject) => {
            const arrow = subject.javaId === 'minecraft:arrow';
            const destroyedBy = arrow
                ? undefined
                : subject.javaId === 'minecraft:cushion'
                  ? javaCushionCheckTick()
                  : javaVehicleHitsToBreak(javaLavaDamage());
            const watched = Math.max(LAVA_TICKS, (destroyedBy ?? 0) + 2);
            const gone = inSandbox(subject.bedrock, 'minecraft:lava', (sandbox) => {
                for (let tick = 1; tick <= watched; tick += 1) {
                    sandbox.tick(1);
                    if (sandbox.stack.runtime.byId(sandbox.entity.id) === undefined) return tick;
                }
                return undefined;
            });
            if (typeof gone === 'string') return gone;
            if (destroyedBy === undefined)
                return gone === undefined
                    ? undefined
                    : `lava destroys it after ${gone} ticks, where Java's arrow is unharmed`;
            return gone !== undefined && Math.abs(gone - destroyedBy) <= 1
                ? undefined
                : `lava ${gone === undefined ? `leaves it whole for ${watched} ticks` : `destroys it after ${gone} ticks`}, where Java destroys it after ${destroyedBy}`;
        }
    },
    {
        name: 'boat-over-bubble-column',
        java: "A boat over a downward bubble column is dragged under after Java's 60 ticks.",
        reference:
            'Java BubbleColumnBlock.entityInside (onAboveBubbleColumn below air), AbstractBoat.onAboveBubbleColumn (bubbleTime 60) and AbstractBoat.tickBubbleColumn (handleBubbleColumnEffect once it runs out), read from the pinned jar',
        subjects: () => entitiesDeclaring('minecraft:inside_block_notifier'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:inside_block_notifier'],
        run: (subject) => {
            const java =
                pushedNumbers(
                    javaMethodNamed('net/minecraft/world/entity/vehicle/boat/AbstractBoat', 'onAboveBubbleColumn')
                ).find((value) => value > 1) ?? 60;
            const sank = inSandbox(subject.bedrock, 'minecraft:water', (sandbox) => {
                const { world } = sandbox.stack;
                const top = SANDBOX_ORIGIN.y + 5;
                for (let y = SANDBOX_ORIGIN.y; y <= top; y += 1)
                    world.world.blocks.set(
                        { x: Math.floor(SANDBOX_ORIGIN.x), y, z: Math.floor(SANDBOX_ORIGIN.z) },
                        { identifier: 'minecraft:bubble_column', states: { drag_down: true } },
                        false
                    );
                // Open the roof over the column and the water its width covers, and set the boat on
                // the surface, so it floats on the water over the column with air on top.
                for (let dx = -1; dx <= 1; dx += 1)
                    for (let dz = -1; dz <= 1; dz += 1)
                        world.setBlock(
                            {
                                x: Math.floor(SANDBOX_ORIGIN.x) + dx,
                                y: top + 1,
                                z: Math.floor(SANDBOX_ORIGIN.z) + dz
                            },
                            'minecraft:air'
                        );
                sandbox.entity.position = { ...SANDBOX_ORIGIN, y: top + 1 };
                const startY = sandbox.entity.position.y;
                for (let tick = 1; tick <= java + 20; tick += 1) {
                    sandbox.tick(1);
                    if (sandbox.entity.position.y < startY - 0.5) return tick;
                }
                return undefined;
            });
            if (typeof sank === 'string') return sank;
            return sank !== undefined && Math.abs(sank - java) <= 2
                ? undefined
                : `over a downward bubble column it ${sank === undefined ? `stays up for ${java + 20} ticks` : `goes under after ${sank} ticks`}, where Java drags it under after ${java}`;
        }
    },
    {
        name: 'ghast-takes-mob-blows',
        java: "A mob's blow lands on a ghast, which Java's Ghast.hurtServer turns aside only for its own reflected fireball rule.",
        reference: 'Java Ghast.hurtServer and Ghast.isInvulnerableTo, read from the pinned jar',
        // The ghast is the one vanilla type the pack makes `cannot_be_attacked`, which the server
        // takes out by Java's rule, so the row names the aspect only while the type declares it.
        subjects: () => subjectsOf(['minecraft:ghast']),
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            (serverContent().entities.registry.get(subject.bedrock)?.declaredComponents ?? []).filter(
                (component) => component === 'minecraft:cannot_be_attacked'
            ),
        run: (subject) => {
            const taken = inSandbox(subject.bedrock, 'air', ({ stack, entity }) => {
                const zombie = stack.runtime.spawn('minecraft:zombie', { ...SANDBOX_ORIGIN, x: SANDBOX_ORIGIN.x + 3 });
                if (zombie === undefined) return 'the sandbox could not put a zombie beside it';
                const outcome = stack.runtime.damage({
                    target: entity.id,
                    attacker: zombie.id,
                    cause: 'entity_attack',
                    amount: 3,
                    source: { route: 'mob_attack', feedback: false, remembered: false }
                });
                return outcome.committed ? outcome.taken : 0;
            });
            if (typeof taken === 'string') return taken;
            return taken > 0 ? undefined : "a zombie's blow does nothing to it, where Java's lands";
        }
    },
    {
        name: 'end-crystal-fire-immune',
        java: 'Fire and lava never touch an end crystal, which Java registers with EntityType.Builder.fireImmune.',
        reference:
            'Java EntityTypes.<clinit> (end_crystal fireImmune) and Entity.isInvulnerableTo, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:fire_immune').filter((subject) => subject.javaId === 'minecraft:end_crystal'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:fire_immune'],
        run: (subject) => {
            const immune = javaFireImmune(subject.javaId);
            const survived = inSandbox(subject.bedrock, 'air', ({ stack, entity }) => {
                stack.runtime.damage({
                    target: entity.id,
                    cause: 'fire',
                    amount: 1,
                    source: { route: 'component', feedback: false, remembered: false }
                });
                return stack.runtime.byId(entity.id) !== undefined;
            });
            if (typeof survived === 'string') return survived;
            return survived === immune
                ? undefined
                : `a fire blow ${survived ? 'leaves it whole' : 'destroys it'}, where Java ${immune ? 'ignores fire' : 'lets fire hurt it'}`;
        }
    },
    {
        name: 'flaps-as-it-flies',
        java: 'A flying mob whose Java class overrides isFlapping sends the flap game event as it flies, which sculk sensors and wardens hear.',
        reference:
            'Java Entity.move (noPhysics returns first; applyMovementEmissionAndPlaySound, processFlappingMovement: GameEvent.FLAP), EnderDragon.aiStep (processFlappingMovement), Vex.tick (noPhysics) and isFlapping in Allay, Bat, Bee, Chicken, EnderDragon, Parrot, Phantom and Vex, read from the pinned jar; issue #3175',
        subjects: () => entitiesDeclaring('minecraft:game_event_movement_tracking'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:game_event_movement_tracking'],
        run: (subject) => {
            const java = javaFlaps(subject.javaId);
            const flapped = inSandbox(
                subject.bedrock,
                'air',
                (sandbox) => {
                    const { gameEvents } = sandbox.stack.world;
                    const before = gameEvents.length;
                    sandbox.tick(40, () => {
                        sandbox.entity.body.velocity = { x: 0.2, y: 0, z: 0 };
                    });
                    return gameEvents
                        .slice(before)
                        .some((event) => event.event.endsWith('flap') && event.sourceId === sandbox.entity.id);
                },
                { lift: 3 }
            );
            if (typeof flapped === 'string') return flapped;
            return flapped === java
                ? undefined
                : `flying for 40 ticks it ${flapped ? 'sends' : 'sends no'} flap game event, where Java ${java ? 'sends them' : 'sends none'}`;
        }
    },
    {
        name: 'dries-out-on-land',
        java: "An axolotl or a dolphin stranded on land takes its first drying blow when Java's air or moisture runs out: an axolotl after 6020 ticks, a dolphin after 2400.",
        reference:
            'Java Axolotl.handleAirSupply (getMaxAirSupply 6000, hurt at -20 air) and Dolphin.tick (moisture 2400, dryOut once it runs out), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:axolotl', 'minecraft:dolphin']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor', 'minecraft:drying_out_timer'],
        run: (subject) => {
            const java = javaFirstDryingHurt(subject.javaId);
            const first = inSandbox(subject.bedrock, 'air', (sandbox) => {
                for (let tick = 1; tick <= java + DRYING_SLACK; tick += 1) {
                    const hits = sandbox.tick(1).filter((hit) => hit.taken > 0 && hit.cause !== 'drowning');
                    if (hits.length > 0) return tick;
                }
                return undefined;
            });
            if (typeof first === 'string') return first;
            return first !== undefined && first >= java && first - java <= DRYING_EVENT_TICKS
                ? undefined
                : `on land its first drying blow lands ${first === undefined ? `past tick ${java + DRYING_SLACK}` : `on tick ${first}`}, where Java's lands on tick ${java}`;
        }
    },
    {
        name: 'hurts-on-contact',
        java: 'A big slime or magma cube hurts an iron golem it touches by its attack damage and passes other mobs by, and a puffed-up pufferfish hurts a mob it touches by 1 plus its puff state.',
        reference: `Java ${Object.values(JAVA_CONTACTS)
            .flat()
            .map((probe) => probe.why)
            .join('; ')}, read from the pinned jar`,
        subjects: () => subjectsOf(Object.keys(JAVA_CONTACTS)),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:area_attack'],
        run: (subject) => {
            const differences: string[] = [];
            for (const probe of JAVA_CONTACTS[subject.javaId] ?? []) {
                const java = probe.java();
                const taken = inSandbox(
                    subject.bedrock,
                    probe.group.includes('puff') ? 'minecraft:water' : 'air',
                    (sandbox) => {
                        const { instance } = sandbox.entity;
                        if (!instance.type.groups.has(probe.group)) return `the server type has no ${probe.group}`;
                        instance.restoreComponentGroups([...instance.activeComponentGroups(), probe.group]);
                        const victim = sandbox.stack.runtime.spawn(probe.victim, SANDBOX_ORIGIN);
                        if (victim === undefined) return `the sandbox could not put ${probe.victim} beside it`;
                        let hurt = 0;
                        const before = sandbox.stack.world.commits.length;
                        sandbox.tick(5);
                        for (const commit of sandbox.stack.world.commits.slice(before))
                            if (commit.target.id === victim.id) hurt = Math.max(hurt, commit.taken);
                        return hurt;
                    }
                );
                if (typeof taken === 'string') return taken;
                if (Math.abs(taken - java) > 1e-6)
                    differences.push(`touching ${probe.victim} it takes ${taken} off it, where Java takes ${java}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'zombie-villager-cure-effects',
        java: "A zombie villager that starts its cure loses its weakness and gains strength, as Java's ZombieVillager.startConverting does.",
        reference:
            'Java ZombieVillager.startConverting (removeEffect WEAKNESS, addEffect STRENGTH), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:zombie_villager']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:spell_effects'],
        run: (subject) => {
            const fields = javaOperations(
                javaMethodNamed(javaEntityClassName(subject.javaId), 'startConverting')
            ).flatMap((operation) =>
                operation.kind === 'field' && operation.target.startsWith('MobEffects.')
                    ? [`minecraft:${operation.target.slice('MobEffects.'.length).toLowerCase()}`]
                    : []
            );
            const [removed, added] = fields;
            const effects = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const { instance, body } = sandbox.entity;
                body.statusEffects.set('minecraft:weakness', {
                    id: 'minecraft:weakness',
                    amplifier: 0,
                    durationTicks: 600,
                    ambient: false,
                    showParticles: true,
                    showIcon: true
                });
                if (!instance.type.groups.has('to_villager')) return 'the server type has no to_villager';
                instance.restoreComponentGroups([...instance.activeComponentGroups(), 'to_villager']);
                sandbox.tick(2);
                return [...body.statusEffects.keys()];
            });
            if (typeof effects === 'string') return effects;
            const differences: string[] = [];
            if (removed !== undefined && effects.includes(removed)) differences.push(`it keeps ${removed}`);
            if (added !== undefined && !effects.includes(added)) differences.push(`it gains no ${added}`);
            return differences.length === 0
                ? undefined
                : `starting its cure ${differences.join(' and ')}, where Java takes ${removed ?? 'nothing'} off and gives it ${added ?? 'nothing'}`;
        }
    },
    {
        name: 'snow-golem-trail',
        java: "A snow golem leaves snow where it stands in a biome Java's snow golem does not melt in.",
        reference:
            'Java SnowGolem.aiStep (mobGriefing, isEmptyBlock, SnowLayerBlock.canSurvive, BiomeTags.SNOW_GOLEM_MELTS), read from the pinned jar; issue #3177',
        subjects: () => subjectsOf(['minecraft:snow_golem']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:trail'],
        run: (subject) => {
            const javaLeavesSnow = javaMethodNamed(javaEntityClassName(subject.javaId), 'aiStep').calls.some((call) =>
                call.endsWith('.setBlockAndUpdate')
            );
            const snowed = inSandbox(subject.bedrock, 'air', (sandbox) => {
                sandbox.tick(3);
                const feet = {
                    x: Math.floor(sandbox.entity.position.x),
                    y: Math.floor(sandbox.entity.position.y),
                    z: Math.floor(sandbox.entity.position.z)
                };
                return sandbox.stack.world.world.blocks.get(feet)?.identifier === 'minecraft:snow_layer';
            });
            if (typeof snowed === 'string') return snowed;
            return snowed === javaLeavesSnow
                ? undefined
                : `standing in the plains it ${snowed ? 'leaves' : 'leaves no'} snow, where Java's ${javaLeavesSnow ? 'leaves' : 'leaves none'}`;
        }
    },
    {
        name: 'breeze-deflects-projectiles',
        java: "An arrow that reaches a breeze bounces back and does it no harm, since the breeze is in Java's deflects_projectiles tag.",
        reference:
            'Java Projectile.hitTargetOrDeflectSelf, Entity.deflection (entity type tag deflects_projectiles) and ProjectileDeflection.REVERSE, read from the pinned jar; issue #3177',
        subjects: () => subjectsOf(['minecraft:breeze']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:reflect_projectiles'],
        run: (subject) => {
            const deflects = serverContent()
                .tags.members('entity_type', 'minecraft:deflects_projectiles')
                .includes(subject.javaId);
            const outcome = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const arrow = sandbox.stack.runtime.spawn('minecraft:arrow', {
                    ...SANDBOX_ORIGIN,
                    x: SANDBOX_ORIGIN.x - 3,
                    y: SANDBOX_ORIGIN.y + 1
                });
                if (arrow === undefined) return 'the sandbox could not fire an arrow';
                arrow.body.velocity = { x: 1.5, y: 0, z: 0 };
                const hits = sandbox.tick(6);
                const live = sandbox.stack.runtime.byId(arrow.id);
                return {
                    hurt: hits.some((hit) => hit.taken > 0),
                    reversed: live !== undefined && live.body.velocity.x < 0
                };
            });
            if (typeof outcome === 'string') return outcome;
            if (!deflects) return outcome.hurt ? undefined : 'the arrow does it no harm, where Java hurts it';
            return !outcome.hurt && outcome.reversed
                ? undefined
                : `an arrow that reaches it ${outcome.hurt ? 'hurts it' : 'does it no harm'} and ${outcome.reversed ? 'bounces back' : 'does not bounce back'}, where Java's bounces back harmlessly`;
        }
    },
    {
        name: 'enderman-dodges-projectiles',
        java: "An enderman a projectile strikes takes no damage and teleports, sending the teleport game event, as Java's EnderMan.hurtServer has it do for every projectile.",
        reference:
            'Java Enderman.hurtServer (DamageTypeTags.IS_PROJECTILE: teleport up to 64 tries, no damage) and Enderman.teleport (GameEvent.TELEPORT once it lands), read from the pinned jar; issue #3177',
        subjects: () => subjectsOf(['minecraft:enderman']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:teleport'],
        run: (subject) => {
            const outcome = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const arrow = sandbox.stack.runtime.spawn('minecraft:arrow', {
                    ...SANDBOX_ORIGIN,
                    x: SANDBOX_ORIGIN.x - 3,
                    y: SANDBOX_ORIGIN.y + 1.5
                });
                if (arrow === undefined) return 'the sandbox could not fire an arrow';
                arrow.body.velocity = { x: 1.5, y: 0, z: 0 };
                // The stack's random source replays one value, which draws every teleport onto the
                // spot the enderman stands on, as Java's would; the game event shows it landed.
                const { gameEvents } = sandbox.stack.world;
                const before = gameEvents.length;
                const hits = sandbox.tick(6);
                return {
                    hurt: hits.some((hit) => hit.taken > 0),
                    teleported: gameEvents
                        .slice(before)
                        .some((event) => event.event === 'minecraft:teleport' && event.sourceId === sandbox.entity.id)
                };
            });
            if (typeof outcome === 'string') return outcome;
            return !outcome.hurt && outcome.teleported
                ? undefined
                : `an arrow that reaches it ${outcome.hurt ? 'hurts it' : 'does it no harm'} and it ${outcome.teleported ? 'teleports' : 'stays'}, where Java's enderman takes no harm and teleports`;
        }
    },
    {
        name: 'ravager-breaks-leaves',
        java: "A ravager walking into leaves breaks them, and breaks no other block, as Java's Ravager.aiStep does.",
        reference:
            'Java Ravager.aiStep (horizontalCollision, mobGriefing, LeavesBlock in the box inflated by 0.2: destroyBlock), read from the pinned jar; issue #3177',
        subjects: () => subjectsOf(['minecraft:ravager']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:break_blocks'],
        run: (subject) => {
            const differences: string[] = [];
            for (const probe of RAVAGER_PROBES) {
                const broke = inSandbox(subject.bedrock, 'air', (sandbox) => {
                    const wall = { x: Math.floor(SANDBOX_ORIGIN.x) + 2, z: Math.floor(SANDBOX_ORIGIN.z) };
                    for (const dz of [-1, 0, 1])
                        for (const dy of [0, 1, 2])
                            sandbox.stack.world.setBlock(
                                { x: wall.x, y: Math.floor(SANDBOX_ORIGIN.y) + dy, z: wall.z + dz },
                                probe.block
                            );
                    sandbox.tick(20, () => {
                        sandbox.entity.body.velocity = { ...sandbox.entity.body.velocity, x: 0.3 };
                    });
                    return (
                        sandbox.stack.world.world.blocks.get({
                            x: wall.x,
                            y: Math.floor(SANDBOX_ORIGIN.y),
                            z: wall.z
                        })?.identifier !== probe.block
                    );
                });
                if (typeof broke === 'string') return broke;
                if (broke !== probe.javaBreaks)
                    differences.push(
                        `walking into ${probe.block} it ${broke ? 'breaks' : 'leaves'} it, where Java ${probe.javaBreaks ? 'breaks' : 'leaves'} it`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    ...reactionScenarios,
    ...moodScenarios
];
