import type { Goal } from '@jsprismarine/entities';

import { goal } from '../goal';
import type { RegisterableGoal } from '../goal';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';
import type { GoalEvent, TargetEntityType } from '../params';
import { bodySchema, booleanAt, entityTypesAt, eventAt, numberAt, stringAt, ticksAt, tickRangeAt } from '../params';

/**
 * The goals that choose what an entity attacks.
 *
 * None of them holds a control flag, which is the documented reason they run
 * beside the attack goals rather than instead of them. They all share the same
 * shape: find a candidate, hold it as the target while it stays valid, and
 * release it when it dies, leaves or stays out of sight too long. Java splits
 * that shape into `TargetGoal` and its ten subclasses, and the constants below
 * are its: an unseen target is forgotten after 60 ticks (`TargetGoal`), a
 * revenge target after 300 (`HurtByTargetGoal`), and a scan runs one tick in
 * ten (`NearestAttackableTargetGoal.DEFAULT_RANDOM_INTERVAL`).
 */

/** How long an unseen target is remembered, from Java's `TargetGoal.unseenMemoryTicks`. */
const FORGET_TICKS = 60;

/** How long a revenge target is remembered, from Java's `HurtByTargetGoal`. */
const REVENGE_FORGET_TICKS = 300;

/** One tick in ten runs a scan, from Java's `NearestAttackableTargetGoal.DEFAULT_RANDOM_INTERVAL`. */
const SCAN_INTERVAL = 10;

/** How the shared find-hold-release loop is parameterized. */
interface TargetHold {
    /** Picks a candidate, or returns undefined when there is none. */
    find(): GoalMob | undefined;
    /** How far the target may get before the goal lets go, in blocks. */
    readonly radius: number;
    /** Whether losing sight starts the forget timer. */
    readonly mustSee: boolean;
    /** How long the target survives out of sight, in ticks. */
    readonly forgetTicks: number;
    /** How long the target is held at most, in ticks; 0 holds it until it is invalid. */
    readonly persistTicks: number;
    /** How many ticks between scans. */
    readonly scanInterval: number;
    /** The chance a scan that found a candidate takes it, in [0, 1]. */
    readonly probability: number;
    /** Whether the goal looks for a new target while one is already set. */
    readonly reselect: boolean;
    /** Whether the candidate has to be reachable by a path. */
    readonly mustReach: boolean;
}

/**
 * The loop every targeting goal runs.
 *
 * It owns the target for as long as it holds it, so the goal that set a target
 * is the goal that clears it, which is what makes `minecraft:on_target_escape`
 * fire once.
 */
const holdTarget = (support: GoalSupport, options: TargetHold): Goal => {
    let held: GoalMob | undefined;
    let unseen = 0;
    let age = 0;
    let cooldown = 0;

    return {
        canStart: () => {
            if (cooldown > 0) {
                cooldown -= 1;
                return false;
            }
            cooldown = options.scanInterval;
            if (!options.reselect && support.target() !== undefined) return false;
            if (!support.chance(options.probability)) return false;
            const candidate = options.find();
            if (candidate === undefined) return false;
            if (options.mustReach && !support.navigator.canReach(candidate.position(), 1)) return false;
            held = candidate;
            return true;
        },
        canContinue: () => {
            const current = support.target();
            if (current === undefined || held === undefined || current.id !== held.id) return false;
            if (support.distanceTo(current.position()) > options.radius) return false;
            if (options.mustSee) {
                if (support.canSee(current)) unseen = 0;
                else if ((unseen += 1) > options.forgetTicks) return false;
            }
            age += 1;
            return options.persistTicks <= 0 || age <= options.persistTicks;
        },
        start: () => {
            unseen = 0;
            age = 0;
            support.setTarget(held);
        },
        stop: () => {
            if (held !== undefined && support.target()?.id === held.id) support.setTarget(undefined);
            held = undefined;
        }
    };
};

/** What `minecraft:behavior.nearest_attackable_target` declares. */
export interface NearestAttackableTargetParams {
    readonly entityTypes: readonly TargetEntityType[];
    /** How far the goal looks, in blocks. */
    readonly withinRadius: number;
    /** How far above and below the goal looks, in blocks. */
    readonly targetSearchHeight: number;
    readonly mustSee: boolean;
    readonly mustReach: boolean;
    /** Whether the goal replaces a target it already has. */
    readonly reselectTargets: boolean;
    /** How long a target survives out of sight, in ticks. */
    readonly mustSeeForgetDuration: number;
    /** How long the target is held at most, in ticks; 0 means until it is invalid. */
    readonly persistTime: number;
    /** The chance a scan takes the candidate it found, in [0, 1]. */
    readonly acquisitionProbability: number;
    /** How many ticks between scans. */
    readonly scanInterval: number;
    /** How long between attack attempts, in ticks. */
    readonly attackInterval: readonly [number, number];
}

const readNearestAttackableTarget = bodySchema((body): NearestAttackableTargetParams => ({
    entityTypes: entityTypesAt(body),
    withinRadius: numberAt(body, 'within_radius', 16),
    targetSearchHeight: numberAt(body, 'target_search_height', -1),
    mustSee: booleanAt(body, 'must_see', false),
    mustReach: booleanAt(body, 'must_reach', false),
    reselectTargets: booleanAt(body, 'reselect_targets', false),
    mustSeeForgetDuration: ticksAt(body, 'must_see_forget_duration', FORGET_TICKS / 20),
    persistTime: ticksAt(body, 'persist_time', 0),
    acquisitionProbability: numberAt(body, 'target_acquisition_probability', 1),
    scanInterval: numberAt(body, 'scan_interval', SCAN_INTERVAL),
    attackInterval: tickRangeAt(body, 'attack_interval', [0, 0])
}));

/** The search radius a goal uses, which is its own radius or the widest entry's. */
const searchRadius = (entries: readonly TargetEntityType[], withinRadius: number): number =>
    Math.max(withinRadius, ...entries.map((entry) => entry.maxDistance), 0);

/**
 * `minecraft:behavior.nearest_attackable_target`, the second most used
 * targeting goal: 49 vanilla entities carry it, usually at priority 2 with
 * `must_see` set.
 *
 * It takes the nearest candidate any `entity_types` entry accepts. Java's
 * `NearestAttackableTargetGoal` is the same goal and contributes the scan
 * interval of one tick in ten.
 */
export const nearestAttackableTarget = goal<NearestAttackableTargetParams>({
    name: 'minecraft:behavior.nearest_attackable_target',
    controlFlags: [],
    schema: readNearestAttackableTarget,
    create: (params, support) =>
        holdTarget(support, {
            find: () => support.findTarget(params.entityTypes, searchRadius(params.entityTypes, params.withinRadius)),
            radius: searchRadius(params.entityTypes, params.withinRadius),
            mustSee: params.mustSee,
            forgetTicks: params.mustSeeForgetDuration,
            persistTicks: params.persistTime,
            scanInterval: params.scanInterval,
            probability: params.acquisitionProbability,
            reselect: params.reselectTargets,
            mustReach: params.mustReach
        })
});

/**
 * `minecraft:behavior.nearest_prioritized_attackable_target`, which three
 * entities carry.
 *
 * It differs from `nearest_attackable_target` in that the order of the
 * `entity_types` entries is a priority order rather than a list to match
 * against, so the first entry that has any candidate wins even when a later
 * entry's candidate is nearer.
 */
export const nearestPrioritizedAttackableTarget = goal<NearestAttackableTargetParams>({
    name: 'minecraft:behavior.nearest_prioritized_attackable_target',
    controlFlags: [],
    schema: readNearestAttackableTarget,
    create: (params, support) => {
        const radius = searchRadius(params.entityTypes, params.withinRadius);
        return holdTarget(support, {
            find: () => {
                const mobs = support.mobs(radius);
                for (const entry of params.entityTypes) {
                    const match = mobs.find((mob) => support.entryFor([entry], mob) !== undefined);
                    if (match !== undefined) return match;
                }
                return undefined;
            },
            radius,
            mustSee: params.mustSee,
            forgetTicks: params.mustSeeForgetDuration,
            persistTicks: params.persistTime,
            scanInterval: params.scanInterval,
            probability: params.acquisitionProbability,
            reselect: params.reselectTargets,
            mustReach: params.mustReach
        });
    }
});

/** What `minecraft:behavior.hurt_by_target` declares. */
export interface HurtByTargetParams {
    /** Which damagers the goal retaliates against; an empty table accepts every one. */
    readonly entityTypes: readonly TargetEntityType[];
    /** Whether the entity turns on its own owner when the owner hurts it. */
    readonly hurtOwner: boolean;
    /** How far the goal tells nearby friends of the same type, in blocks. */
    readonly alertSameType: number;
}

/**
 * `minecraft:behavior.hurt_by_target`, which 42 vanilla entities carry, 31 of
 * them at priority 1.
 *
 * It takes the last entity that damaged this one. Java's `HurtByTargetGoal`
 * remembers an unseen revenge target for 300 ticks rather than the 60 every
 * other target goal uses, and alerts friends within 10 blocks vertically.
 */
export const hurtByTarget = goal<HurtByTargetParams>({
    name: 'minecraft:behavior.hurt_by_target',
    controlFlags: [],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        hurtOwner: booleanAt(body, 'hurt_owner', false),
        alertSameType: numberAt(body, 'alert_same_type', 0)
    })),
    create: (params, support) =>
        holdTarget(support, {
            find: () => {
                const damager = support.world.damagers?.().at(-1)?.mob;
                if (damager === undefined) return undefined;
                if (!params.hurtOwner && support.world.owner?.()?.id === damager.id) return undefined;
                if (params.entityTypes.length > 0 && !support.accepts(params.entityTypes, damager)) return undefined;
                return damager;
            },
            radius: Number.POSITIVE_INFINITY,
            mustSee: false,
            forgetTicks: REVENGE_FORGET_TICKS,
            persistTicks: 0,
            scanInterval: 0,
            probability: 1,
            reselect: true,
            mustReach: false
        })
});

/**
 * `minecraft:behavior.owner_hurt_by_target`, which the wolf carries.
 *
 * It takes whatever hurt the entity's owner. Java's `OwnerHurtByTargetGoal` is
 * the same goal.
 */
export const ownerHurtByTarget = goal<readonly TargetEntityType[]>({
    name: 'minecraft:behavior.owner_hurt_by_target',
    controlFlags: [],
    schema: bodySchema((body) => entityTypesAt(body)),
    create: (entries, support) =>
        holdTarget(support, {
            find: () => {
                const candidate = support.world.owner?.()?.lastDamager?.();
                if (candidate === undefined) return undefined;
                if (entries.length > 0 && !support.accepts(entries, candidate)) return undefined;
                return candidate;
            },
            radius: Number.POSITIVE_INFINITY,
            mustSee: false,
            forgetTicks: REVENGE_FORGET_TICKS,
            persistTicks: 0,
            scanInterval: 0,
            probability: 1,
            reselect: true,
            mustReach: false
        })
});

/**
 * `minecraft:behavior.owner_hurt_target`, which the wolf carries.
 *
 * It takes whatever the entity's owner is attacking, which is what makes a
 * tamed wolf join its owner's fight. Java's `OwnerHurtTargetGoal` is the same
 * goal.
 */
export const ownerHurtTarget = goal<readonly TargetEntityType[]>({
    name: 'minecraft:behavior.owner_hurt_target',
    controlFlags: [],
    schema: bodySchema((body) => entityTypesAt(body)),
    create: (entries, support) =>
        holdTarget(support, {
            find: () => {
                const candidate = support.world.owner?.()?.target?.();
                if (candidate === undefined) return undefined;
                if (entries.length > 0 && !support.accepts(entries, candidate)) return undefined;
                return candidate;
            },
            radius: Number.POSITIVE_INFINITY,
            mustSee: false,
            forgetTicks: FORGET_TICKS,
            persistTicks: 0,
            scanInterval: 0,
            probability: 1,
            reselect: true,
            mustReach: false
        })
});

/** What `minecraft:behavior.defend_trusted_target` declares. */
export interface DefendTrustedTargetParams {
    readonly entityTypes: readonly TargetEntityType[];
    readonly withinRadius: number;
    readonly mustSee: boolean;
    /** The sound the entity plays when it takes a target. */
    readonly aggroSound: string | undefined;
    /** The event fired when the goal starts defending. */
    readonly onDefendStart: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.defend_trusted_target`, which the fox carries.
 *
 * It attacks whatever hurt an entity this one trusts, which is the `trusts`
 * fact on the filter view.
 */
export const defendTrustedTarget = goal<DefendTrustedTargetParams>({
    name: 'minecraft:behavior.defend_trusted_target',
    controlFlags: [],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        withinRadius: numberAt(body, 'within_radius', 16),
        mustSee: booleanAt(body, 'must_see', false),
        aggroSound: stringAt(body, 'aggro_sound'),
        onDefendStart: eventAt(body, 'on_defend_start')
    })),
    create: (params, support) => {
        const hold = holdTarget(support, {
            find: () => {
                const candidates = support.mobs(params.withinRadius);
                return candidates.find((mob) => {
                    const trusted = mob.view().attackTarget?.();
                    if (trusted === undefined) return false;
                    if (support.entity.filterContext().self.trusts?.(trusted) !== true) return false;
                    return params.entityTypes.length === 0 || support.accepts(params.entityTypes, mob);
                });
            },
            radius: params.withinRadius,
            mustSee: params.mustSee,
            forgetTicks: FORGET_TICKS,
            persistTicks: 0,
            scanInterval: SCAN_INTERVAL,
            probability: 1,
            reselect: false,
            mustReach: false
        });
        return {
            ...hold,
            start: () => {
                hold.start?.();
                support.playSound(params.aggroSound);
                support.fire(params.onDefendStart);
            }
        };
    }
});

/** What `minecraft:behavior.defend_village_target` declares. */
export interface DefendVillageTargetParams {
    readonly entityTypes: readonly TargetEntityType[];
    readonly mustReach: boolean;
}

/** How far the iron golem looks for something attacking its village, in blocks. */
const VILLAGE_DEFENSE_RADIUS = 64;

/**
 * `minecraft:behavior.defend_village_target`, which the iron golem carries.
 *
 * Java's `DefendVillageTargetGoal` scans the golem's own bounding box inflated
 * by its follow range rather than a fixed radius, and prefers a hurt villager's
 * attacker over a raider. This takes the nearest candidate the `entity_types`
 * table accepts within 64 blocks, because the package has no village model to
 * ask who belongs to it.
 */
export const defendVillageTarget = goal<DefendVillageTargetParams>({
    name: 'minecraft:behavior.defend_village_target',
    controlFlags: [],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        mustReach: booleanAt(body, 'must_reach', false)
    })),
    create: (params, support) =>
        holdTarget(support, {
            find: () => support.findTarget(params.entityTypes, VILLAGE_DEFENSE_RADIUS),
            radius: VILLAGE_DEFENSE_RADIUS,
            mustSee: false,
            forgetTicks: FORGET_TICKS,
            persistTicks: 0,
            scanInterval: SCAN_INTERVAL,
            probability: 1,
            reselect: false,
            mustReach: params.mustReach
        })
});

/** What `minecraft:behavior.target_when_pushed` declares. */
export interface TargetWhenPushedParams {
    readonly entityTypes: readonly TargetEntityType[];
    /** The chance of retaliating against a push, as a percentage. */
    readonly percentChance: number;
}

/**
 * `minecraft:behavior.target_when_pushed`, which the polar bear carries.
 *
 * A push is not damage, so the candidate comes from
 * {@link GoalWorld.lastPusher} rather than the damage list.
 */
export const targetWhenPushed = goal<TargetWhenPushedParams>({
    name: 'minecraft:behavior.target_when_pushed',
    controlFlags: [],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        percentChance: numberAt(body, 'percent_chance', 100)
    })),
    create: (params, support) =>
        holdTarget(support, {
            find: () => {
                const pusher = support.world.lastPusher?.();
                if (pusher === undefined) return undefined;
                if (params.entityTypes.length > 0 && !support.accepts(params.entityTypes, pusher)) return undefined;
                return pusher;
            },
            radius: Number.POSITIVE_INFINITY,
            mustSee: false,
            forgetTicks: FORGET_TICKS,
            persistTicks: 0,
            scanInterval: 0,
            probability: params.percentChance / 100,
            reselect: true,
            mustReach: false
        })
});

/**
 * `minecraft:behavior.wither_target_highest_damage`, which the wither carries.
 *
 * It takes whoever has dealt the entity the most damage so far, which is what
 * {@link GoalWorld.damagers} totals.
 */
export const witherTargetHighestDamage = goal<readonly TargetEntityType[]>({
    name: 'minecraft:behavior.wither_target_highest_damage',
    controlFlags: [],
    schema: bodySchema((body) => entityTypesAt(body)),
    create: (entries, support) =>
        holdTarget(support, {
            find: () => {
                const records = support.world.damagers?.() ?? [];
                let best: GoalMob | undefined;
                let highest = 0;
                for (const record of records) {
                    if (record.mob === undefined || record.total <= highest) continue;
                    if (entries.length > 0 && !support.accepts(entries, record.mob)) continue;
                    best = record.mob;
                    highest = record.total;
                }
                return best;
            },
            radius: Number.POSITIVE_INFINITY,
            mustSee: false,
            forgetTicks: REVENGE_FORGET_TICKS,
            persistTicks: 0,
            scanInterval: SCAN_INTERVAL,
            probability: 1,
            reselect: true,
            mustReach: false
        })
});

/** Every goal in the targeting family. */
export const targetingGoals: readonly RegisterableGoal[] = [
    nearestAttackableTarget,
    nearestPrioritizedAttackableTarget,
    hurtByTarget,
    ownerHurtByTarget,
    ownerHurtTarget,
    defendTrustedTarget,
    defendVillageTarget,
    targetWhenPushed,
    witherTargetHighestDamage
];
