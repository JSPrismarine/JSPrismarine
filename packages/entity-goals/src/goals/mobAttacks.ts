import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import { bodySchema, isRecord, stringAt } from '../params';
import type { GoalMob } from '../world';

/**
 * The attack goals of the blaze, the ghast and the shulker, which Java writes as goals of the
 * mob's own class rather than as a shared ranged or melee goal.
 *
 * Bedrock's files give these mobs `minecraft:behavior.ranged_attack`, and the blaze a melee goal
 * a target sensor switches to, whose timings and ranges are not Java's. The server swaps them for
 * these goals, which keep Java's counters tick for tick. Each names the projectile it fires in its
 * `projectile` key, since the shooter component of the file may sit in a group the goal outlives.
 */

/** The blaze's goal. Bedrock has no goal of this kind, so it carries the server's namespace. */
export const BLAZE_ATTACK = 'jsprismarine:behavior.blaze_attack';

/** The ghast's goal. */
export const GHAST_SHOOT_FIREBALL = 'jsprismarine:behavior.ghast_shoot_fireball';

/** The shulker's goal. */
export const SHULKER_ATTACK = 'jsprismarine:behavior.shulker_attack';

/** What these goals declare: the projectile they fire. */
interface MobAttackParams {
    readonly projectile: string | undefined;
}

const projectileSchema = bodySchema((body): MobAttackParams => ({ projectile: stringAt(body, 'projectile') }));

/** The follow range a mob whose definition declares none has, Java's `Attributes.FOLLOW_RANGE` default. */
const DEFAULT_FOLLOW_RANGE = 16;

/** `Blaze$BlazeAttackGoal`: a bite inside 2 blocks, otherwise a charge and a burst of fireballs. */
const BLAZE = {
    /** `distanceToSqr < 4.0`: the target is close enough to bite. */
    meleeRange: 2,
    /** Ticks between two bites. */
    biteCooldown: 20,
    /** Ticks the blaze charges before its first fireball. */
    chargeTicks: 60,
    /** Ticks between the fireballs of one burst. */
    burstTicks: 6,
    /** The attack steps that fire, the second to the fourth: three fireballs a burst. */
    lastFiringStep: 4,
    /** Ticks the blaze rests after a burst. */
    restTicks: 100,
    /** `lastSeen < 5`: how long the blaze keeps closing in on a target it lost sight of. */
    lostSightTicks: 5
} as const;

/**
 * Java's `Blaze$BlazeAttackGoal`, which holds `move` and `look`.
 *
 * Every tick it counts its attack time down. A target in sight inside 2 blocks is bitten once
 * every 20 ticks while the blaze moves onto it. A target in sight within its follow range starts
 * the cycle: 60 ticks of charging, three fireballs 6 ticks apart, and 100 ticks of rest. A target
 * out of sight is still closed in on for the first 5 ticks after the blaze lost it.
 */
export const blazeAttack = goal<MobAttackParams>({
    name: BLAZE_ATTACK,
    controlFlags: ['move', 'look'],
    schema: projectileSchema,
    create: (params, support) => {
        let attackStep = 0;
        let attackTime = 0;
        let lastSeen = 0;
        const usable = (): boolean => support.target() !== undefined;
        return {
            canStart: usable,
            canContinue: usable,
            start: () => {
                attackStep = 0;
            },
            stop: () => {
                lastSeen = 0;
            },
            tick: () => {
                attackTime -= 1;
                const target = support.target();
                if (target === undefined) return;
                const seen = support.canSee(target);
                lastSeen = seen ? 0 : lastSeen + 1;
                const where = target.position();
                const distance = support.distanceTo(where);
                if (distance < BLAZE.meleeRange) {
                    if (!seen) return;
                    if (attackTime <= 0) {
                        attackTime = BLAZE.biteCooldown;
                        support.world.attack?.(target);
                    }
                    support.actuator?.moveTo(where, 1);
                } else if (distance < support.entity.attributes.value('follow_range', DEFAULT_FOLLOW_RANGE) && seen) {
                    if (attackTime <= 0) {
                        attackStep += 1;
                        if (attackStep === 1) attackTime = BLAZE.chargeTicks;
                        else if (attackStep <= BLAZE.lastFiringStep) attackTime = BLAZE.burstTicks;
                        else {
                            attackTime = BLAZE.restTicks;
                            attackStep = 0;
                        }
                        if (attackStep > 1) support.world.shoot?.(target, params.projectile);
                    }
                    support.lookAtMob(target);
                } else if (lastSeen < BLAZE.lostSightTicks) support.actuator?.moveTo(where, 1);
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** `Ghast$GhastShootFireballGoal`'s numbers. */
const GHAST = {
    /** `distanceToSqr < 4096.0`: the target is within 64 blocks. */
    range: 64,
    /** The charge tick that fires. */
    fireAt: 20,
    /** Where the charge drops to after a shot, so the next one comes 60 ticks later. */
    afterShot: -40
} as const;

/**
 * Java's `Ghast$GhastShootFireballGoal`, which holds no flag, so the ghast drifts while it aims.
 *
 * With a target in sight within 64 blocks the charge counts up a tick at a time and fires at 20,
 * then drops to -40, one fireball every 60 ticks. Out of sight or range it counts back down to 0.
 */
export const ghastShootFireball = goal<MobAttackParams>({
    name: GHAST_SHOOT_FIREBALL,
    controlFlags: [],
    schema: projectileSchema,
    create: (params, support) => {
        let chargeTime = 0;
        const usable = (): boolean => support.target() !== undefined;
        return {
            canStart: usable,
            canContinue: usable,
            start: () => {
                chargeTime = 0;
            },
            tick: () => {
                const target = support.target();
                if (target === undefined) return;
                if (support.distanceTo(target.position()) < GHAST.range && support.canSee(target)) {
                    chargeTime += 1;
                    if (chargeTime === GHAST.fireAt) {
                        support.world.shoot?.(target, params.projectile);
                        chargeTime = GHAST.afterShot;
                    }
                } else if (chargeTime > 0) chargeTime -= 1;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** `Shulker$ShulkerAttackGoal`'s numbers. */
const SHULKER = {
    /** `distanceToSqr < 400.0`: the target is within 20 blocks. */
    range: 20,
    /** The attack time `start` sets and the least a shot resets it to. */
    firstShot: 20,
    /** A shot resets the attack time to 20 plus `nextInt(10) * 20 / 2`. */
    spreadSteps: 10,
    stepTicks: 10
} as const;

/** Whether the world is at peaceful difficulty, where Java's shulker never attacks. */
const peaceful = (difficulty: string | undefined): boolean => difficulty === 'peaceful';

/**
 * Java's `Shulker$ShulkerAttackGoal`, which holds `move` and `look`.
 *
 * Off peaceful, it fires its first bullet 20 ticks after it starts and then one every 20 to 110
 * ticks, in steps of 10, at a target within 20 blocks; a target any farther is dropped.
 */
export const shulkerAttack = goal<MobAttackParams>({
    name: SHULKER_ATTACK,
    controlFlags: ['move', 'look'],
    schema: projectileSchema,
    create: (params, support) => {
        let attackTime = 0;
        const usable = (): boolean => support.target() !== undefined && !peaceful(support.worldView()?.difficulty?.());
        return {
            canStart: usable,
            canContinue: usable,
            start: () => {
                attackTime = SHULKER.firstShot;
            },
            tick: () => {
                if (peaceful(support.worldView()?.difficulty?.())) return;
                attackTime -= 1;
                const target: GoalMob | undefined = support.target();
                if (target === undefined) return;
                support.lookAtMob(target);
                if (support.distanceTo(target.position()) < SHULKER.range) {
                    if (attackTime <= 0) {
                        attackTime = SHULKER.firstShot + support.randomInt(SHULKER.spreadSteps) * SHULKER.stepTicks;
                        support.world.shoot?.(target, params.projectile);
                    }
                } else support.setTarget(undefined);
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** The phantom's target goal. */
export const PHANTOM_ATTACK_PLAYER_TARGET = 'jsprismarine:behavior.phantom_attack_player_target';

/** `Phantom$PhantomAttackPlayerTargetGoal`'s numbers. */
const PHANTOM_TARGET = {
    /** `reducedTickDelay(20)`: the selector updates before the first scan. */
    firstScan: 10,
    /** `reducedTickDelay(60)`: the selector updates between two scans. */
    scanInterval: 30,
    /** `TargetingConditions.forCombat().range(64.0)`. */
    range: 64,
    /** `getBoundingBox().inflate(16.0, 64.0, 16.0)`: how far past its box it looks across and up or down. */
    across: 16,
    upDown: 64
} as const;

/** A player's box, which Java's `EntityType.PLAYER` sizes 0.6 across and 1.8 tall. */
const PLAYER_BOX = { width: 0.6, height: 1.8 } as const;

/**
 * Java's `Phantom$PhantomAttackPlayerTargetGoal`, a target goal that holds no flag.
 *
 * Ten selector updates after it appears, and then every 30 while it has no target, the phantom
 * takes the highest player it may attack among those in its box inflated by 16 across and 64 up
 * and down and within 64 blocks. It keeps the target while it may still attack it.
 */
export const phantomAttackPlayerTarget = goal<Record<string, unknown>>({
    name: PHANTOM_ATTACK_PLAYER_TARGET,
    controlFlags: [],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        let nextScan: number = PHANTOM_TARGET.firstScan;
        const inBox = (mob: GoalMob): boolean => {
            const here = support.position();
            const there = mob.position();
            const box = support.entity.componentParams('minecraft:collision_box');
            const width = isRecord(box) && typeof box.width === 'number' ? box.width : 0.9;
            const height = isRecord(box) && typeof box.height === 'number' ? box.height : 0.5;
            const across = (width + PLAYER_BOX.width) / 2 + PHANTOM_TARGET.across;
            return (
                Math.abs(there.x - here.x) < across &&
                Math.abs(there.z - here.z) < across &&
                there.y + PLAYER_BOX.height > here.y - PHANTOM_TARGET.upDown &&
                there.y < here.y + height + PHANTOM_TARGET.upDown
            );
        };
        return {
            canStart: () => {
                if (nextScan > 0) {
                    nextScan -= 1;
                    return false;
                }
                nextScan = PHANTOM_TARGET.scanInterval;
                const players = support
                    .players(PHANTOM_TARGET.range)
                    .filter((player) => inBox(player) && support.isAttackable(player))
                    .sort((left, right) => right.position().y - left.position().y);
                const [highest] = players;
                if (highest === undefined) return false;
                support.setTarget(highest);
                return true;
            },
            canContinue: () => {
                const target = support.target();
                return target !== undefined && support.isAttackable(target);
            }
        };
    }
});

/** The attack goals of the blaze, the ghast and the shulker, and the phantom's target goal. */
export const mobAttackGoals: readonly RegisterableGoal[] = [
    blazeAttack,
    ghastShootFireball,
    shulkerAttack,
    phantomAttackPlayerTarget
];
