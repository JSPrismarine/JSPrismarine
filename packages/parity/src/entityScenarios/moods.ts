import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EntityPosition } from '@jsprismarine/entities';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { isRecord } from '../isRecord.ts';
import { serverContent } from '../serverStack.ts';
import { javaEntityClassName, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import type { SandboxRun } from './sandbox.ts';
import { SANDBOX_ORIGIN, inSandbox } from './sandbox.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring, field } from './subjects.ts';

/**
 * Moods: anger, a shulker's peeking and a stare. Each scenario stands a store player beside the
 * mob in the shared stack's sandbox, where goals and brains run, and compares what the mob does
 * about it with Java's targeting.
 */

/** Where a scenario stands a bystander: beside the subject, `distance` blocks east. */
const beside = (distance: number): EntityPosition => ({ ...SANDBOX_ORIGIN, x: SANDBOX_ORIGIN.x + distance });

/** The id the bystander player is filed under. */
const BYSTANDER = 920_001;

/** One target goal of Java's committed goal capture. */
interface JavaTargetGoal {
    readonly goal: string;
    readonly classes: readonly string[];
    readonly targetType: string | undefined;
    /** Whether the goal calls `setAlertOthers`, which turns the mob's kind on its attacker too. */
    readonly alertsOthers: boolean;
}

let goalCapture: Readonly<Record<string, readonly JavaTargetGoal[]>> | undefined;

/** Java's target goals by entity type, from the committed capture of the pinned jar's `registerGoals`. */
const javaTargetGoals = (javaId: string): readonly JavaTargetGoal[] | undefined => {
    if (goalCapture === undefined) {
        const path = join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            '..',
            '..',
            'bedrock-data',
            'src',
            'jsp',
            'java',
            'entity_goals.json'
        );
        // Parsed JSON boundary: the goal capture `packages/bedrock-data/utils/java-goals` writes.
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
        const found: Record<string, JavaTargetGoal[]> = {};
        if (isRecord(parsed))
            for (const [entity, goals] of Object.entries(parsed)) {
                if (!Array.isArray(goals)) continue;
                found[entity] = goals.flatMap((goal): JavaTargetGoal[] => {
                    if (field(goal, 'selector') !== 'target') return [];
                    const classes = field(goal, 'classes');
                    const type = field(field(field(goal, 'params'), 'targetType'), 'class');
                    const calls = field(goal, 'calls');
                    return [
                        {
                            goal: String(field(goal, 'goal')),
                            classes: Array.isArray(classes) ? classes.map(String) : [],
                            targetType: typeof type === 'string' ? type : undefined,
                            alertsOthers:
                                Array.isArray(calls) && calls.some((call) => field(call, 'name') === 'setAlertOthers')
                        }
                    ];
                });
            }
        goalCapture = found;
    }
    return goalCapture[javaId];
};

/**
 * The brain-driven types the goal capture does not hold: whether one a zombie hits on dry land turns
 * on it, and whether it alerts its kind. A nautilus picks no target out of water
 * (`NautilusAi.findNearestValidAttackTarget`).
 */
const JAVA_BRAIN_RETALIATION: Readonly<Record<string, { readonly retaliates: boolean; readonly alerts: boolean }>> = {
    'minecraft:hoglin': { retaliates: true, alerts: true },
    'minecraft:piglin': { retaliates: true, alerts: true },
    'minecraft:piglin_brute': { retaliates: true, alerts: true },
    'minecraft:zoglin': { retaliates: true, alerts: false },
    'minecraft:nautilus': { retaliates: false, alerts: false },
    'minecraft:zombie_nautilus': { retaliates: false, alerts: false }
};

/** Whether a Java mob a zombie hits alerts others of its kind: `setAlertOthers` on its hurt-by goal, or its brain's broadcast. */
const javaAlertsKin = (javaId: string): boolean | undefined => {
    const brain = JAVA_BRAIN_RETALIATION[javaId];
    if (brain !== undefined) return brain.alerts;
    const goals = javaTargetGoals(javaId);
    if (goals === undefined) return undefined;
    return goals.some((goal) => goal.alertsOthers);
};

/** Whether a Java mob turns on what hurt it: a hurt-by target goal, or a brain that retaliates. */
const javaRetaliates = (javaId: string): boolean =>
    JAVA_BRAIN_RETALIATION[javaId]?.retaliates ??
    (javaTargetGoals(javaId) ?? []).some((goal) => goal.classes.includes('HurtByTargetGoal'));

/** Ticks the anger rows give a hurt mob's kin to turn on the attacker. */
const ALERT_TICKS = 40;

/** The Java types that are `NeutralMob`s, which `neutral-anger-time` covers. */
const JAVA_NEUTRAL = new Set([
    'minecraft:bee',
    'minecraft:enderman',
    'minecraft:polar_bear',
    'minecraft:wolf',
    'minecraft:zombified_piglin'
]);

/** Ticks a sandbox until the subject targets `id`, up to `ticks`; the tick it did, or undefined. */
const targetsWithin = (sandbox: SandboxRun, id: number, ticks: number): number | undefined => {
    for (let tick = 1; tick <= ticks; tick += 1) {
        sandbox.tick(1);
        if (sandbox.entity.body.target === id) return tick;
    }
    return undefined;
};

/** The yaw and pitch a player at `from` has looking at `to`, as Bedrock writes them. */
const facing = (from: EntityPosition, to: EntityPosition): { readonly yaw: number; readonly pitch: number } => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    return {
        yaw: (Math.atan2(-dx, dz) * 180) / Math.PI,
        pitch: (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
    };
};

/**
 * Stands a survival player the host reports at `at`, the way a connected player is seen by the
 * runtime's targeting, for the rest of the sandbox run.
 */
const standBystander = (
    sandbox: SandboxRun,
    at: EntityPosition,
    look: { readonly yaw: number; readonly pitch: number } = { yaw: 0, pitch: 0 }
): { readonly id: number } => {
    const player = { id: BYSTANDER, identifier: 'minecraft:player', position: at, ...look };
    sandbox.stack.world.players = [player];
    return player;
};

/** The scenarios of moods. */
export const moodScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'anger-alerts-kin',
        java: "A mob Java does not treat as neutral answers a blow through its own targeting: when a zombie hits it, another of its kind beside it turns on the zombie only where Java's HurtByTargetGoal alerts others or its brain broadcasts the target.",
        reference:
            'Java registerGoals target selectors of the committed goal capture (HurtByTargetGoal.setAlertOthers in Dolphin, Panda, Silverfish and Vindicator; none in Spider, CaveSpider, Llama and TraderLlama), PiglinAi.maybeRetaliate and broadcastAngerTarget (piglins and brutes), HoglinAi.maybeRetaliate and broadcastAttackTarget, Zoglin.hurtServer and NautilusAi.setAngerTarget (no broadcast), read from the pinned jar; issue #3187',
        subjects: () => entitiesDeclaring('minecraft:angry').filter((subject) => !JAVA_NEUTRAL.has(subject.javaId)),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:angry'],
        run: (subject) => {
            const java = javaAlertsKin(subject.javaId);
            if (java === undefined) return `no Java retaliation is recorded for ${subject.javaId}`;
            const alerted = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const { runtime } = sandbox.stack;
                const kin = runtime.spawn(subject.bedrock, beside(2));
                const zombie = runtime.spawn('minecraft:zombie', beside(-5));
                if (kin === undefined || zombie === undefined)
                    return 'the sandbox could not put a second one and a zombie beside it';
                runtime.damage({
                    target: sandbox.entity.id,
                    attacker: zombie.id,
                    cause: 'entity_attack',
                    amount: 1,
                    source: { route: 'mob_attack', feedback: false, remembered: true }
                });
                let hit = false;
                for (let tick = 1; tick <= ALERT_TICKS; tick += 1) {
                    sandbox.tick(1);
                    hit ||= sandbox.entity.body.target === zombie.id;
                    if (kin.body.target === zombie.id) return { kin: true, hit };
                }
                return { kin: false, hit };
            });
            if (typeof alerted === 'string') return alerted;
            if (!alerted.hit && javaRetaliates(subject.javaId))
                return "hit by a zombie, it never turns on the zombie itself, where Java's turns on its attacker";
            if (alerted.kin === java) return undefined;
            return alerted.kin
                ? 'when a zombie hits it, another of its kind beside it turns on the zombie, which Java leaves alone'
                : 'when a zombie hits it, another of its kind beside it does not turn on the zombie, where Java alerts it';
        }
    },
    {
        name: 'shulker-peeks',
        java: "A shulker with no target opens its shell now and then, Java's ShulkerPeekGoal rolling one in 20 every other tick.",
        reference:
            'Java Shulker$ShulkerPeekGoal.canUse (getTarget() == null, random.nextInt(reducedTickDelay(40)) == 0) and start (peek 30 for 20 to 60 ticks), read from the pinned jar; issue #3188',
        subjects: () => entitiesDeclaring('minecraft:peek'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:peek'],
        run: (subject) => {
            const peek = javaMethodOf(`${javaEntityClassName(subject.javaId)}$ShulkerPeekGoal`, 'canUse');
            const chance = peek === undefined ? undefined : pushedNumbers(peek.method).find((value) => value > 1);
            if (chance === undefined) return "Java's shulker no longer peeks";
            const opened = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const closed = sandbox.entity.instance.activeComponentGroups().join();
                for (let tick = 1; tick <= 20 * chance; tick += 1) {
                    sandbox.tick(1);
                    if (sandbox.entity.instance.activeComponentGroups().join() !== closed) return tick;
                }
                return undefined;
            });
            if (typeof opened === 'string') return opened;
            return opened === undefined
                ? `with no target it never opens in ${20 * chance} ticks, where Java's opens about every ${chance}`
                : undefined;
        }
    },
    {
        name: 'stared-at',
        java: "A player who stares at an enderman's head angers it, as Java's EnderMan$EndermanLookForPlayerGoal has it; a creaking within 12 blocks of a player who is not looking wakes and goes for the player, as Java's Creaking.checkCanMove does.",
        reference:
            'Java EnderMan.isBeingStaredBy and EnderMan$EndermanLookForPlayerGoal, and Creaking.checkCanMove (distanceToSqr < 144 activates, isLookingAtMe freezes), read from the pinned jar; issue #3189',
        subjects: () => entitiesDeclaring('minecraft:looked_at'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:looked_at'],
        run: (subject) => {
            const creaking = subject.javaId === 'minecraft:creaking';
            // A component the registry holds as data only never runs, and nothing else reads a stare.
            if (serverContent().entities.components.hooksOf('minecraft:looked_at').size === 0)
                return creaking
                    ? 'the server runs nothing for minecraft:looked_at, so a player near it never wakes it or freezes it, where Java activates it within 12 blocks and freezes it while looked at'
                    : "the server runs nothing for minecraft:looked_at, so a stare never angers it, where Java's turns on the player who stares";
            const engaged = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const at = beside(creaking ? 8 : 10);
                const eyes = { ...sandbox.entity.position, y: sandbox.entity.position.y + 2.5 };
                // The enderman's starer looks at its head; the creaking's player looks away.
                const look = creaking ? facing(at, { ...at, x: at.x + 10 }) : facing({ ...at, y: at.y + 1.62 }, eyes);
                const player = standBystander(sandbox, at, look);
                return targetsWithin(sandbox, player.id, 100) !== undefined;
            });
            if (typeof engaged === 'string') return engaged;
            if (engaged) return undefined;
            return creaking
                ? 'a player eight blocks away looking elsewhere does not wake it, where Java activates it and it goes for the player'
                : "a player ten blocks away staring at its head does not anger it in 100 ticks, where Java's turns on the player";
        }
    },
    {
        name: 'warden-heartbeat',
        java: "A warden's heartbeat quickens with its anger, every 40 ticks calm and every 10 when angry, which Java's client times and plays from the anger level the server syncs.",
        reference:
            'Java Warden.getHeartBeatDelay (40 - floor(clamp(anger / 80, 0, 1) * 30)) and Warden.tick, which runs it only on the client, read from the pinned jar',
        subjects: () => entitiesDeclaring('minecraft:heartbeat'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:heartbeat'],
        run: (subject) => {
            const delay = javaMethodOf(javaEntityClassName(subject.javaId), 'getHeartBeatDelay');
            if (delay === undefined || !delay.method.calls.some((call) => call.endsWith('.getClientAngerLevel')))
                return "Java's heartbeat no longer reads the client's anger level";
            return serverContent().entities.components.hooksOf('minecraft:heartbeat').size === 0
                ? 'the server runs nothing for minecraft:heartbeat; the client beats the heart from the anger level'
                : 'the server runs minecraft:heartbeat, which Java leaves to the client';
        },
        classify: (_subject, difference) =>
            difference.startsWith('the server runs nothing')
                ? {
                      kind: 'intentional',
                      reason: "The heartbeat is the client's sound and animation, which Java times on the client from the synced anger level: rendered presentation, category 1 of docs/data-driven/parity.md."
                  }
                : undefined
    },
    {
        name: 'breeze-ground-sound',
        java: "A breeze's idle sound changes with whether it stands on the ground with a target, which Java's client picks; nothing else about the breeze follows it.",
        reference: 'Java Breeze.tick (soundTick, playWhirlSound) and Breeze.getAmbientSound, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter(
                (subject) => subject.javaId === 'minecraft:breeze'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: (subject) => {
            const changed = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const groups = sandbox.entity.instance.activeComponentGroups().join();
                sandbox.tick(10);
                return sandbox.entity.instance.activeComponentGroups().join() !== groups;
            });
            if (typeof changed === 'string') return changed;
            return changed
                ? 'its environment sensor changes its component groups, which Java ties to nothing'
                : 'its environment sensor sets only which idle sound it plays';
        },
        classify: (_subject, difference) =>
            difference.startsWith('its environment sensor sets only')
                ? {
                      kind: 'intentional',
                      reason: 'The sensor only picks the idle ground sound, which is sound selection: rendered presentation, category 1 of docs/data-driven/parity.md.'
                  }
                : undefined
    },
    {
        name: 'unrun-components',
        java: "A bee carrying nectar grows the crops it passes over, Java's Bee$BeeGrowCropGoal, and a ravager a shield blocks is stunned or throws the defender back, Java's Ravager.blockedByItem.",
        reference:
            'Java Bee$BeeGrowCropGoal (nextInt(adjustedTickDelay(30)), bee_growables, 10 crops a pollination) and Ravager.blockedByItem (stunnedTick 40 half the time, strongKnockback otherwise), read from the pinned jar; issue #3194',
        subjects: () => [
            ...entitiesDeclaring('minecraft:grows_crop').map((subject) => ({
                ...subject,
                tag: 'minecraft:grows_crop'
            })),
            ...entitiesDeclaring('minecraft:ravager_blocked').map((subject) => ({
                ...subject,
                tag: 'minecraft:ravager_blocked'
            }))
        ],
        idOf: (subject) => subject.javaId,
        aspects: (subject) => (subject.tag === undefined ? [] : [subject.tag]),
        run: (subject) => {
            const component = subject.tag ?? '';
            const java =
                component === 'minecraft:grows_crop'
                    ? javaMethodOf(`${javaEntityClassName(subject.javaId)}$BeeGrowCropGoal`, 'tick')
                    : javaMethodOf(javaEntityClassName(subject.javaId), 'blockedByItem');
            if (java === undefined) return `Java's ${subject.javaId} no longer has the rule ${component} stands for`;
            // A component the registry holds as data only never runs, and no runtime code reads these two.
            return serverContent().entities.components.hooksOf(component).size > 0
                ? undefined
                : `the server runs nothing for ${component}, so ${component === 'minecraft:grows_crop' ? 'a bee grows no crop' : 'a blocked ravager is never stunned or pushed back'}, where Java's does`;
        }
    }
];
