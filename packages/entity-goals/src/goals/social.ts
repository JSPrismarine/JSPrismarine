import type { Goal } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import type { GoalBody, GoalEvent, Range, TargetEntityType } from '../params';
import {
    bodySchema,
    booleanAt,
    entityTypesAt,
    eventAt,
    eventsAt,
    filterAt,
    numberAt,
    stringAt,
    stringsAt,
    tickRangeAt,
    ticksAt
} from '../params';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';

/**
 * The goals about other entities and players: breeding, following an owner,
 * being tempted by an item, mounting, trading and giving things away.
 *
 * The constants that have a Java counterpart are Java's: `BreedGoal` looks for
 * a partner within 8 blocks, holds it for 60 ticks and breeds inside 3;
 * `FollowParentGoal` scans 8 by 4 by 8, ignores a parent closer than 3 and
 * gives up past 16; `TemptGoal` stops 2.5 blocks short and is scared off by a
 * player who moves more than 0.1 blocks or turns more than 5 degrees;
 * `OfferFlowerGoal` offers for 400 ticks on a 1-in-8000 chance per tick.
 */

/** How far a breeding partner may be, from Java's `BreedGoal.PARTNER_TARGETING`. */
const PARTNER_RANGE = 8;

/** How long two animals court before the child appears, from Java's `BreedGoal`. */
const LOVE_TICKS = 60;

/** How close they have to be when it happens, from Java's `BreedGoal`. */
const BREED_DISTANCE = 3;

/** Whether a host can rule out a mate search before supplying nearby entities. */
const canSearchForMate = (support: GoalSupport): boolean => support.world.isReadyToBreed?.() !== false;

/** How far a baby looks for its parent, from Java's `FollowParentGoal.HORIZONTAL_SCAN_RANGE`. */
const PARENT_SCAN_RANGE = 8;

/** How close a baby stops following, from Java's `FollowParentGoal.DONT_FOLLOW_IF_CLOSER_THAN`. */
const PARENT_STOP_DISTANCE = 3;

/** How far a baby gives up, from Java's `FollowParentGoal.canContinueToUse`. */
const PARENT_GIVE_UP_DISTANCE = 16;

/** Where a tempted entity stops, from Java's `TemptGoal.DEFAULT_STOP_DISTANCE`. */
const TEMPT_STOP_DISTANCE = 2.5;

/** How long the iron golem holds a flower out, from Java's `OfferFlowerGoal.OFFER_TICKS`. */
const OFFER_TICKS = 400;

/** What `minecraft:behavior.breed` declares. */
export interface BreedParams {
    readonly speedMultiplier: number;
}

/**
 * `minecraft:behavior.breed`, which 26 vanilla entities carry.
 *
 * The partner search, the 60-tick courtship and the 3-block distance come
 * from Java's `BreedGoal`. Whether two entities may breed at all is the
 * server's to answer through {@link GoalWorld.canBreedWith}, because the rule
 * lives in `minecraft:breedable` rather than in the goal.
 */
export const breed = goal<BreedParams>({
    name: 'minecraft:behavior.breed',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) => {
        let partner: GoalMob | undefined;
        let courting = 0;

        return {
            canStart: () => {
                if (!canSearchForMate(support)) {
                    partner = undefined;
                    return false;
                }
                partner = support.mobs(PARTNER_RANGE).find((mob) => support.world.canBreedWith?.(mob) === true);
                return partner !== undefined;
            },
            canContinue: () => partner !== undefined && courting < LOVE_TICKS,
            start: () => {
                courting = 0;
            },
            tick: () => {
                const mate = partner;
                if (mate === undefined) return;
                support.lookAtMob(mate);
                support.navigator.moveTo(mate.position(), params.speedMultiplier, BREED_DISTANCE);
                courting += 1;
                if (courting < LOVE_TICKS || support.distanceTo(mate.position()) > BREED_DISTANCE) return;
                support.world.breedWith?.(mate);
            },
            stop: () => {
                partner = undefined;
                courting = 0;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.make_love`, which the villager carries. It is the
 * villager's breeding goal, and the child is a new villager rather than a
 * baby of the same type.
 */
export const makeLove = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.make_love',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        let partner: GoalMob | undefined;
        let courting = 0;
        return {
            canStart: () => {
                if (!canSearchForMate(support)) {
                    partner = undefined;
                    return false;
                }
                partner = support.mobs(PARTNER_RANGE).find((mob) => support.world.canBreedWith?.(mob) === true);
                return partner !== undefined;
            },
            canContinue: () => partner !== undefined && courting < LOVE_TICKS,
            start: () => {
                courting = 0;
            },
            tick: () => {
                const mate = partner;
                if (mate === undefined) return;
                support.lookAtMob(mate);
                support.navigator.moveTo(mate.position(), 1, BREED_DISTANCE);
                courting += 1;
                if (courting >= LOVE_TICKS) support.world.breedWith?.(mate);
            },
            stop: () => {
                partner = undefined;
                courting = 0;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.receive_love`, which the villager carries. It is the
 * other half of `make_love`: the partner stands still and waits.
 */
export const receiveLove = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.receive_love',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        let remaining = 0;
        return {
            canStart: () =>
                canSearchForMate(support) &&
                support.mobs(PARTNER_RANGE).some((mob) => support.world.canBreedWith?.(mob) === true),
            canContinue: () => remaining > 0,
            start: () => {
                remaining = LOVE_TICKS;
                support.navigator.stop();
            },
            tick: () => {
                remaining -= 1;
            },
            stop: () => {
                remaining = 0;
            }
        };
    }
});

/**
 * `minecraft:behavior.follow_parent`, which 24 vanilla entities carry.
 *
 * Java's `FollowParentGoal` scans 8 blocks out and 4 up, ignores a parent
 * closer than 3 blocks, gives up past 16 and re-paths every 10 ticks.
 */
export const followParent = goal<{ readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.follow_parent',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1.1) })),
    create: (params, support) => {
        let parent: GoalMob | undefined;
        let repath = 0;

        return {
            canStart: () => {
                if (!support.flag('is_baby')) return false;
                parent = support
                    .mobs(PARENT_SCAN_RANGE)
                    .find(
                        (mob) =>
                            mob.view().flag?.('is_baby') !== true &&
                            mob.identifier?.() === support.entity.type.identifier &&
                            support.distanceTo(mob.position()) >= PARENT_STOP_DISTANCE
                    );
                return parent !== undefined;
            },
            canContinue: () => {
                if (parent === undefined || !support.flag('is_baby')) return false;
                const range = support.distanceTo(parent.position());
                return range >= PARENT_STOP_DISTANCE && range <= PARENT_GIVE_UP_DISTANCE;
            },
            start: () => {
                repath = 0;
            },
            tick: () => {
                if ((repath -= 1) > 0) {
                    support.navigator.tick();
                    return;
                }
                repath = 10;
                if (parent !== undefined)
                    support.navigator.moveTo(parent.position(), params.speedMultiplier, PARENT_STOP_DISTANCE);
            },
            stop: () => {
                parent = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.tempt` declares. */
export interface TemptParams {
    readonly speedMultiplier: number;
    /** The items that tempt the entity. */
    readonly items: readonly string[];
    /** How far the entity notices a held item, in blocks. */
    readonly withinRadius: number;
    /** Whether a sudden move or turn scares the entity off. */
    readonly canGetScared: boolean;
    /** Whether the entity follows an item held above or below it. */
    readonly canTemptVertically: boolean;
    /** Whether a ridden entity still follows the item. */
    readonly canTemptWhileRidden: boolean;
    /** How close the entity comes before it stops, in blocks. */
    readonly stopDistance: number;
    readonly temptSound: string | undefined;
    readonly soundInterval: Range;
    readonly onTemptStart: GoalEvent | undefined;
    readonly onTemptEnd: GoalEvent | undefined;
}

const temptFrom = (body: GoalBody): TemptParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', 1),
    items: stringsAt(body, 'items'),
    withinRadius: numberAt(body, 'within_radius', 16),
    canGetScared: booleanAt(body, 'can_get_scared', false),
    canTemptVertically: booleanAt(body, 'can_tempt_vertically', false),
    canTemptWhileRidden: booleanAt(body, 'can_tempt_while_ridden', false),
    stopDistance: numberAt(body, 'stop_distance', TEMPT_STOP_DISTANCE),
    temptSound: stringAt(body, 'tempt_sound'),
    soundInterval: tickRangeAt(body, 'sound_interval', [0, 0]),
    onTemptStart: eventAt(body, 'on_tempt_start'),
    onTemptEnd: eventAt(body, 'on_tempt_end')
});

/** The shared tempt loop, used by `tempt` and by the ghast's `float_tempt`. */
const temptLoop = (support: GoalSupport, params: TemptParams): Goal => {
    let player: GoalMob | undefined;
    let soundTimer = 0;

    return {
        canStart: () => {
            if (!params.canTemptWhileRidden && support.flag('is_riding')) return false;
            player = support.players(params.withinRadius).find((candidate) => {
                const held = candidate.heldItem?.();
                return held !== undefined && params.items.includes(held);
            });
            return player !== undefined;
        },
        canContinue: () => {
            if (player === undefined) return false;
            const held = player.heldItem?.();
            if (held === undefined || !params.items.includes(held)) return false;
            return support.distanceTo(player.position()) <= params.withinRadius;
        },
        start: () => {
            soundTimer = 0;
            support.fire(params.onTemptStart, player);
        },
        tick: () => {
            const holder = player;
            if (holder === undefined) return;
            support.lookAtMob(holder);
            if (params.temptSound !== undefined && (soundTimer -= 1) <= 0) {
                soundTimer = support.between(params.soundInterval[0], params.soundInterval[1]);
                support.playSound(params.temptSound);
            }
            if (support.distanceTo(holder.position()) <= params.stopDistance) {
                support.navigator.stop();
                return;
            }
            support.navigator.moveTo(holder.position(), params.speedMultiplier, params.stopDistance);
            support.navigator.tick();
        },
        stop: () => {
            support.fire(params.onTemptEnd, player);
            player = undefined;
            support.navigator.stop();
        }
    };
};

/**
 * `minecraft:behavior.tempt`, which 31 vanilla entities carry.
 *
 * Java's `TemptGoal` stops 2.5 blocks short, and when `can_get_scared` is set
 * it drops the player who moves more than 0.1 blocks or turns more than 5
 * degrees inside 6 blocks. The movement and rotation test needs a player view
 * the goal seam does not carry, so `can_get_scared` is parsed and the scare
 * itself is left to the server.
 */
export const tempt = goal<TemptParams>({
    name: 'minecraft:behavior.tempt',
    controlFlags: ['move', 'look'],
    schema: bodySchema(temptFrom),
    create: (params, support) => temptLoop(support, params)
});

/**
 * `minecraft:behavior.float_tempt`, which the happy ghast carries. It is
 * `tempt` for an entity that floats, so the item tempts it vertically as well.
 */
export const floatTempt = goal<TemptParams>({
    name: 'minecraft:behavior.float_tempt',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        ...temptFrom(body),
        canTemptVertically: booleanAt(body, 'can_tempt_vertically', true)
    })),
    create: (params, support) => temptLoop(support, params)
});

/** What `minecraft:behavior.follow_owner` declares. */
export interface FollowOwnerParams {
    readonly speedMultiplier: number;
    /** How far away the owner has to be before the entity sets off, in blocks. */
    readonly startDistance: number;
    /** How close the entity gets before it stops, in blocks. */
    readonly stopDistance: number;
    /** Whether the entity teleports when it cannot walk to the owner. */
    readonly canTeleport: boolean;
    /** How far from the owner a teleport lands, in blocks; -1 uses the stop distance. */
    readonly postTeleportDistance: number;
    /** Whether the entity follows an owner who is sneaking away. */
    readonly ignoreVibration: boolean;
}

/**
 * `minecraft:behavior.follow_owner`, which the five tamable entities carry.
 *
 * Java's `FollowOwnerGoal` sets off past `start_distance`, stops inside
 * `stop_distance` and teleports when the path is blocked, which is what
 * `can_teleport` selects.
 */
export const followOwner = goal<FollowOwnerParams>({
    name: 'minecraft:behavior.follow_owner',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        startDistance: numberAt(body, 'start_distance', 10),
        stopDistance: numberAt(body, 'stop_distance', 2),
        canTeleport: booleanAt(body, 'can_teleport', true),
        postTeleportDistance: numberAt(body, 'post_teleport_distance', -1),
        ignoreVibration: booleanAt(body, 'ignore_vibration', true)
    })),
    create: (params, support) => {
        let owner: GoalMob | undefined;
        let repath = 0;

        return {
            canStart: () => {
                owner = support.world.owner?.();
                return owner !== undefined && support.distanceTo(owner.position()) > params.startDistance;
            },
            canContinue: () => owner !== undefined && support.distanceTo(owner.position()) > params.stopDistance,
            start: () => {
                repath = 0;
            },
            tick: () => {
                const keeper = owner;
                if (keeper === undefined) return;
                support.lookAtMob(keeper);
                if ((repath -= 1) > 0) {
                    support.navigator.tick();
                    return;
                }
                repath = 10;
                const reachable = support.navigator.moveTo(
                    keeper.position(),
                    params.speedMultiplier,
                    params.stopDistance
                );
                if (reachable || !params.canTeleport) return;
                support.world.teleportTo?.(keeper.position());
            },
            stop: () => {
                owner = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.teleport_to_owner`, which the wolf and the cat carry.
 * It is the teleport on its own, for the cases where following would take too
 * long.
 */
export const teleportToOwner = goal<{ readonly filters: Filter | undefined }>({
    name: 'minecraft:behavior.teleport_to_owner',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ filters: filterAt(body, 'filters') })),
    create: (params, support) => ({
        canStart: () => {
            const owner = support.world.owner?.();
            if (owner === undefined) return false;
            return support.matches(params.filters, owner);
        },
        start: () => {
            const owner = support.world.owner?.();
            if (owner !== undefined) support.world.teleportTo?.(owner.position());
        }
    })
});

/**
 * `minecraft:behavior.pet_sleep_with_owner`, which the cat carries. The cat
 * finds the bed its owner is in and curls up on it.
 */
export const petSleepWithOwner = goal<{
    readonly speedMultiplier: number;
    readonly goalRadius: number;
    readonly searchHeight: number;
}>({
    name: 'minecraft:behavior.pet_sleep_with_owner',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        goalRadius: numberAt(body, 'goal_radius', 1),
        searchHeight: numberAt(body, 'search_height', 10)
    })),
    create: (params, support) => {
        let sleeping = false;
        return {
            canStart: () => {
                const owner = support.world.owner?.();
                return owner !== undefined && owner.view().flag?.('is_sleeping') === true;
            },
            canContinue: () => support.world.owner?.()?.view().flag?.('is_sleeping') === true,
            start: () => {
                const owner = support.world.owner?.();
                if (owner !== undefined)
                    support.navigator.moveTo(owner.position(), params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (sleeping) return;
                sleeping = true;
                support.world.setSleeping?.(true);
            },
            stop: () => {
                if (sleeping) {
                    const owner = support.world.owner?.();
                    const wokeWithOwner = owner?.view().flag?.('is_sleeping') === false;
                    support.world.setSleeping?.(false);
                    if (wokeWithOwner) support.entity.trigger('minecraft:on_wake_with_owner');
                }
                sleeping = false;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.stay_while_sitting`, which four vanilla entities carry.
 * It holds the entity in place for as long as the sit flag is set, and it is
 * the reason a sitting wolf ignores everything else.
 */
export const stayWhileSitting = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.stay_while_sitting',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.flag('is_sitting'),
        canContinue: () => support.flag('is_sitting'),
        start: () => {
            support.navigator.stop();
        }
    })
});

/** What `minecraft:behavior.find_mount` declares. */
export interface FindMountParams {
    /** How far the entity looks for something to ride, in blocks. */
    readonly withinRadius: number;
    /** How long it waits before the first attempt, in ticks. */
    readonly startDelay: number;
    /** How many failures it takes before it gives up. */
    readonly maxFailedAttempts: number;
    /** How close it has to be to climb on, in blocks. */
    readonly mountDistance: number;
    /** Whether it refuses a mount standing in water. */
    readonly avoidWater: boolean;
    /** Whether it only looks for a mount while it has a target. */
    readonly targetNeeded: boolean;
}

/**
 * `minecraft:behavior.find_mount`, which the eight jockey entities carry. It
 * is what puts a baby zombie on a chicken.
 */
export const findMount = goal<FindMountParams>({
    name: 'minecraft:behavior.find_mount',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        withinRadius: numberAt(body, 'within_radius', 16),
        startDelay: ticksAt(body, 'start_delay', 0),
        maxFailedAttempts: numberAt(body, 'max_failed_attempts', 3),
        mountDistance: numberAt(body, 'mount_distance', 2),
        avoidWater: booleanAt(body, 'avoid_water', false),
        targetNeeded: booleanAt(body, 'target_needed', false)
    })),
    create: (params, support) => {
        let mount: GoalMob | undefined;
        let delay = params.startDelay;
        let failures = 0;

        return {
            canStart: () => {
                if (delay > 0) {
                    delay -= 1;
                    return false;
                }
                if (failures >= params.maxFailedAttempts) return false;
                if (params.targetNeeded && support.target() === undefined) return false;
                if (support.world.vehicle?.() !== undefined) return false;
                mount = support.mobs(params.withinRadius)[0];
                return mount !== undefined;
            },
            canContinue: () => mount !== undefined && support.world.vehicle?.() === undefined,
            start: () => {
                if (mount !== undefined) support.navigator.moveTo(mount.position(), 1, params.mountDistance);
            },
            tick: () => {
                const target = mount;
                if (target === undefined) return;
                if (support.distanceTo(target.position()) > params.mountDistance) {
                    if (support.navigator.tick()) return;
                    failures += 1;
                    mount = undefined;
                    return;
                }
                support.world.mount?.(target);
            },
            stop: () => {
                mount = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.player_ride_tamed`, which the ten rideable tamed
 * entities carry. It hands movement to the rider, so the goal holds the move
 * flag and does nothing with it.
 */
export const playerRideTamed = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.player_ride_tamed',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.flag('is_tamed') && (support.world.riders?.() ?? []).length > 0,
        canContinue: () => (support.world.riders?.() ?? []).length > 0,
        start: () => {
            support.navigator.stop();
        }
    })
});

/**
 * `minecraft:behavior.controlled_by_player`, which the pig and the strider
 * carry. It is `player_ride_tamed` for an entity steered with an item rather
 * than taming.
 */
export const controlledByPlayer = goal<{ readonly mountSpeedMultiplier: number }>({
    name: 'minecraft:behavior.controlled_by_player',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ mountSpeedMultiplier: numberAt(body, 'mount_speed_multiplier', 1) })),
    create: (_params, support) => ({
        canStart: () => (support.world.riders?.() ?? []).length > 0,
        canContinue: () => (support.world.riders?.() ?? []).length > 0,
        start: () => {
            support.navigator.stop();
        }
    })
});

/** What `minecraft:behavior.play` declares. */
export interface PlayParams {
    readonly speedMultiplier: number;
    /** Which entities the entity plays with. */
    readonly friendTypes: readonly TargetEntityType[];
}

/**
 * `minecraft:behavior.play`, which the baby villager carries. It chases
 * another young villager around the village.
 */
export const play = goal<PlayParams>({
    name: 'minecraft:behavior.play',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        friendTypes: entityTypesAt(body, 'friend_types')
    })),
    create: (params, support) => {
        let friend: GoalMob | undefined;
        return {
            canStart: () => {
                friend = support.findTarget(params.friendTypes, 16);
                return friend !== undefined;
            },
            canContinue: () => friend !== undefined && support.navigator.walking,
            start: () => {
                if (friend !== undefined) support.navigator.moveTo(friend.position(), params.speedMultiplier, 2);
            },
            tick: () => {
                if (friend !== undefined) support.lookAtMob(friend);
                support.navigator.tick();
            },
            stop: () => {
                friend = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.mingle` declares. */
export interface MingleParams {
    readonly speedMultiplier: number;
    /** How long one conversation lasts, in ticks. */
    readonly duration: number;
    /** How long before the entity mingles again, in ticks. */
    readonly cooldown: number;
    /** How close two entities stand while mingling, in blocks. */
    readonly mingleDistance: number;
    /** Which entity type counts as someone to mingle with. */
    readonly partnerType: string | undefined;
}

/**
 * `minecraft:behavior.mingle`, which the villager carries. It is the
 * gathering at the village bell, which the villager schedule drives.
 */
export const mingle = goal<MingleParams>({
    name: 'minecraft:behavior.mingle',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        duration: ticksAt(body, 'duration', 1),
        cooldown: ticksAt(body, 'cooldown_time', 10),
        mingleDistance: numberAt(body, 'mingle_distance', 2),
        partnerType: stringAt(body, 'mingle_partner_type')
    })),
    create: (params, support) => {
        let partner: GoalMob | undefined;
        let remaining = 0;
        let cooldown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                partner = support
                    .mobs(16)
                    .find((mob) => params.partnerType === undefined || mob.identifier?.() === params.partnerType);
                return partner !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                if (partner !== undefined)
                    support.navigator.moveTo(partner.position(), params.speedMultiplier, params.mingleDistance);
            },
            tick: () => {
                remaining -= 1;
                if (partner !== undefined) support.lookAtMob(partner);
                support.navigator.tick();
            },
            stop: () => {
                remaining = 0;
                cooldown = params.cooldown;
                partner = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.share_items` declares. */
export interface ShareItemsParams {
    readonly entityTypes: readonly TargetEntityType[];
    readonly speedMultiplier: number;
    /** How far the entity looks for someone to give to, in blocks. */
    readonly maxDistance: number;
    /** How close it has to be to hand the item over, in blocks. */
    readonly goalRadius: number;
}

/**
 * `minecraft:behavior.share_items`, which the villager carries. It is how a
 * farmer hands bread to the villagers who have none.
 */
export const shareItems = goal<ShareItemsParams>({
    name: 'minecraft:behavior.share_items',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        maxDistance: numberAt(body, 'max_dist', 0),
        goalRadius: numberAt(body, 'goal_radius', 1)
    })),
    create: (params, support) => {
        let recipient: GoalMob | undefined;
        return {
            canStart: () => {
                if ((support.world.inventory?.() ?? []).length === 0) return false;
                recipient = support.findTarget(params.entityTypes, params.maxDistance);
                return recipient !== undefined;
            },
            canContinue: () => recipient !== undefined && support.navigator.walking,
            start: () => {
                if (recipient !== undefined)
                    support.navigator.moveTo(recipient.position(), params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                const taker = recipient;
                const item = support.world.inventory?.()[0];
                if (taker !== undefined && item !== undefined) support.world.giveItem?.(taker, item);
                recipient = undefined;
            },
            stop: () => {
                recipient = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.beg`, which the wolf carries.
 *
 * Java's `BegGoal` holds the beg for 40 to 80 ticks while the player keeps
 * holding an interesting item, which is what `look_time` spells here.
 */
export const beg = goal<{
    readonly items: readonly string[];
    readonly lookDistance: number;
    readonly lookTime: Range;
}>({
    name: 'minecraft:behavior.beg',
    controlFlags: ['look'],
    schema: bodySchema((body) => ({
        items: stringsAt(body, 'items'),
        lookDistance: numberAt(body, 'look_distance', 8),
        lookTime: tickRangeAt(body, 'look_time', [2, 4])
    })),
    create: (params, support) => {
        let player: GoalMob | undefined;
        let remaining = 0;

        const holding = (candidate: GoalMob): boolean => {
            const held = candidate.heldItem?.();
            return held !== undefined && params.items.includes(held);
        };

        return {
            canStart: () => {
                player = support.players(params.lookDistance).find(holding);
                return player !== undefined;
            },
            canContinue: () => remaining > 0 && player !== undefined && holding(player),
            start: () => {
                remaining = support.between(params.lookTime[0], params.lookTime[1]);
            },
            tick: () => {
                remaining -= 1;
                if (player !== undefined) support.lookAtMob(player);
            },
            stop: () => {
                remaining = 0;
                player = undefined;
            }
        };
    }
});

/**
 * `minecraft:behavior.offer_flower`, which the iron golem carries.
 *
 * Java's `OfferFlowerGoal` offers a poppy to a villager within 6 blocks on a
 * 1-in-8000 chance per tick and holds it out for 400 ticks.
 */
export const offerFlower = goal<{ readonly filters: Filter | undefined }>({
    name: 'minecraft:behavior.offer_flower',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({ filters: filterAt(body, 'filters') })),
    create: (params, support) => {
        /** How often the offer starts, from Java's `OfferFlowerGoal.canUse`. */
        const offerChance = 1 / 8000;
        /** How far the golem looks, from Java's `OFFER_TARGET_CONTEXT`. */
        const offerRange = 6;
        let villager: GoalMob | undefined;
        let remaining = 0;

        return {
            canStart: () => {
                if (!support.chance(offerChance)) return false;
                villager = support.mobs(offerRange).find((mob) => support.matches(params.filters, mob));
                return villager !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = OFFER_TICKS;
                support.world.setCarriedItem?.('minecraft:poppy');
            },
            tick: () => {
                remaining -= 1;
                if (villager !== undefined) support.lookAtMob(villager);
            },
            stop: () => {
                remaining = 0;
                villager = undefined;
                support.world.setCarriedItem?.(undefined);
            }
        };
    }
});

/**
 * `minecraft:behavior.take_flower`, which the villager carries. It is the
 * other half of `offer_flower`: the villager walks over and takes it.
 */
export const takeFlower = goal<{ readonly filters: Filter | undefined; readonly onTakeFlower: GoalEvent | undefined }>({
    name: 'minecraft:behavior.take_flower',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        filters: filterAt(body, 'filters'),
        onTakeFlower: eventAt(body, 'on_take_flower')
    })),
    create: (params, support) => {
        // The villager watches for as long as the golem holds the flower out,
        // which is Java's `OfferFlowerGoal.OFFER_TICKS`.
        let remaining = 0;
        let giver: GoalMob | undefined;

        return {
            canStart: () => {
                giver = support
                    .mobs(6)
                    .find((mob) => mob.heldItem?.() === 'minecraft:poppy' && support.matches(params.filters, mob));
                return giver !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = OFFER_TICKS;
            },
            tick: () => {
                remaining -= 1;
                if (giver !== undefined) support.lookAtMob(giver);
            },
            stop: () => {
                remaining = 0;
                support.fire(params.onTakeFlower, giver);
                giver = undefined;
            }
        };
    }
});

/**
 * `minecraft:behavior.trade_with_player`, which the three trader entities
 * carry.
 *
 * Java's `TradeWithPlayerGoal` holds the entity still while the trade screen
 * is open and drops it when the player gets further than 4 blocks away.
 */
export const tradeWithPlayer = goal<{ readonly filters: Filter | undefined }>({
    name: 'minecraft:behavior.trade_with_player',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({ filters: filterAt(body, 'filters') })),
    create: (params, support) => {
        /** How far the player may get, from Java's `TradeWithPlayerGoal.canContinueToUse`. */
        const tradeRange = 4;
        return {
            canStart: () => {
                const player = support.world.tradingPlayer?.();
                return player !== undefined && support.matches(params.filters, player);
            },
            canContinue: () => {
                const player = support.world.tradingPlayer?.();
                return player !== undefined && support.distanceTo(player.position()) <= tradeRange;
            },
            start: () => {
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.trade_interest` declares. */
export interface TradeInterestParams {
    /** How long the entity shows one item, in ticks. */
    readonly carriedItemSwitchTime: number;
    /** How long before the entity loses interest, in ticks. */
    readonly interestTime: number;
    /** How long it holds the last item out, in ticks. */
    readonly removeItemTime: number;
    /** How long before the goal may run again, in ticks. */
    readonly cooldown: number;
    /** How far the player may be, in blocks. */
    readonly withinRadius: number;
}

/**
 * `minecraft:behavior.trade_interest`, which the villager and the wandering
 * trader carry. The entity holds up what it would trade when a player comes
 * close carrying something it wants.
 */
export const tradeInterest = goal<TradeInterestParams>({
    name: 'minecraft:behavior.trade_interest',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        carriedItemSwitchTime: ticksAt(body, 'carried_item_switch_time', 2),
        interestTime: ticksAt(body, 'interest_time', 45),
        removeItemTime: ticksAt(body, 'remove_item_time', 1),
        cooldown: ticksAt(body, 'cooldown', 2),
        withinRadius: numberAt(body, 'within_radius', 3)
    })),
    create: (params, support) => {
        let player: GoalMob | undefined;
        let remaining = 0;
        let cooldown = 0;
        let switchTimer = 0;
        let shown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                player = support.nearestPlayer(params.withinRadius);
                return player !== undefined;
            },
            canContinue: () =>
                remaining > 0 && player !== undefined && support.distanceTo(player.position()) <= params.withinRadius,
            start: () => {
                remaining = params.interestTime;
                switchTimer = params.carriedItemSwitchTime;
                shown = 0;
            },
            tick: () => {
                remaining -= 1;
                if (player !== undefined) support.lookAtMob(player);
                if ((switchTimer -= 1) > 0) return;
                switchTimer = params.carriedItemSwitchTime;
                const offers = support.world.inventory?.() ?? [];
                if (offers.length === 0) return;
                support.world.setCarriedItem?.(offers[shown % offers.length]);
                shown += 1;
            },
            stop: () => {
                remaining = 0;
                cooldown = params.cooldown;
                player = undefined;
                support.world.setCarriedItem?.(undefined);
            }
        };
    }
});

/**
 * `minecraft:behavior.barter`, which the piglin carries. The piglin throws
 * back an item from its barter table once it has finished admiring the gold.
 */
export const barter = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.barter',
    controlFlags: [],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.entity.hasComponent('minecraft:barter'),
        start: () => {
            const here = support.position();
            support.world.dropItem?.('minecraft:gold_ingot', here);
        }
    })
});

/** What `minecraft:behavior.admire_item` declares. */
export interface AdmireItemParams {
    readonly admireSound: string | undefined;
    readonly soundInterval: Range;
    readonly onStart: GoalEvent | undefined;
    readonly onStop: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.admire_item`, which the piglin carries. The admiration
 * timer itself lives in `minecraft:admire_item`; the goal holds the entity
 * still while it runs.
 */
export const admireItem = goal<AdmireItemParams>({
    name: 'minecraft:behavior.admire_item',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        admireSound: stringAt(body, 'admire_item_sound'),
        soundInterval: tickRangeAt(body, 'sound_interval', [2, 5]),
        onStart: eventAt(body, 'on_admire_item_start'),
        onStop: eventAt(body, 'on_admire_item_stop')
    })),
    create: (params, support) => {
        let soundTimer = 0;
        return {
            canStart: () => support.world.carriedItem?.() !== undefined,
            canContinue: () => support.world.carriedItem?.() !== undefined,
            start: () => {
                soundTimer = 0;
                support.navigator.stop();
                support.fire(params.onStart);
            },
            tick: () => {
                if ((soundTimer -= 1) > 0) return;
                soundTimer = support.between(params.soundInterval[0], params.soundInterval[1]);
                support.playSound(params.admireSound);
            },
            stop: () => {
                support.fire(params.onStop);
            }
        };
    }
});

/** What `minecraft:behavior.drop_item_for` declares. */
export interface DropItemForParams {
    readonly entityTypes: readonly TargetEntityType[];
    /** How long before the entity gives another present, in ticks. */
    readonly cooldown: number;
    /** The chance of actually dropping something, in [0, 1]. */
    readonly dropChance: number;
    /** The table the present is rolled from. */
    readonly lootTable: string | undefined;
    /** How close the entity drops the present, in blocks. */
    readonly offeringDistance: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    readonly searchRange: number;
    readonly searchHeight: number;
    /** How long before the recipient may pick the present up, in ticks. */
    readonly secondsBeforePickup: number;
    /** The hours of the day the goal runs in, in ticks. */
    readonly timeOfDayRange: Range;
    readonly onDropAttempt: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.drop_item_for`, which the cat carries. It is the gift a
 * tamed cat leaves on its owner's bed in the morning.
 */
export const dropItemFor = goal<DropItemForParams>({
    name: 'minecraft:behavior.drop_item_for',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        cooldown: ticksAt(body, 'cooldown', 1),
        dropChance: numberAt(body, 'drop_item_chance', 1),
        lootTable: stringAt(body, 'loot_table'),
        offeringDistance: numberAt(body, 'offering_distance', 5),
        goalRadius: numberAt(body, 'goal_radius', 1),
        searchRange: numberAt(body, 'search_range', 5),
        searchHeight: numberAt(body, 'search_height', 1),
        secondsBeforePickup: ticksAt(body, 'seconds_before_pickup', 0),
        timeOfDayRange: rangeOfDay(body),
        onDropAttempt: eventAt(body, 'on_drop_attempt')
    })),
    create: (params, support) => {
        let recipient: GoalMob | undefined;
        let cooldown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                const time = support.timeOfDay();
                if (time !== undefined && (time < params.timeOfDayRange[0] || time > params.timeOfDayRange[1]))
                    return false;
                recipient = support.findTarget(params.entityTypes, params.searchRange);
                return recipient !== undefined;
            },
            canContinue: () => recipient !== undefined && support.navigator.walking,
            start: () => {
                if (recipient !== undefined) support.navigator.moveTo(recipient.position(), 1, params.offeringDistance);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                support.fire(params.onDropAttempt, recipient);
                if (params.lootTable !== undefined && support.chance(params.dropChance))
                    support.world.dropLoot?.(params.lootTable, support.position());
                recipient = undefined;
            },
            stop: () => {
                cooldown = params.cooldown;
                recipient = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** Reads `time_of_day_range`, which vanilla writes as a fraction of the day in [0, 1]. */
const rangeOfDay = (body: GoalBody): Range => {
    const value = body.time_of_day_range;
    const parts = Array.isArray(value) ? value.filter((part) => typeof part === 'number') : [];
    const start = parts[0] ?? 0;
    const end = parts[1] ?? 1;
    return [Math.round(start * 24000), Math.round(end * 24000)];
};

/** What the give-items goals declare. */
export interface GiveItemsParams {
    readonly runSpeed: number;
    readonly throwSound: string | undefined;
    readonly onItemThrow: readonly GoalEvent[];
}

const giveItemsFrom = (body: GoalBody): GiveItemsParams => ({
    runSpeed: numberAt(body, 'run_speed', 1),
    throwSound: stringAt(body, 'throw_sound'),
    onItemThrow: eventsAt(body, 'on_item_throw')
});

/**
 * `minecraft:behavior.go_and_give_items_to_owner`, which the allay carries.
 * It carries whatever it picked up back to the player who gave it an item.
 */
export const goAndGiveItemsToOwner = goal<GiveItemsParams>({
    name: 'minecraft:behavior.go_and_give_items_to_owner',
    controlFlags: ['move'],
    schema: bodySchema(giveItemsFrom),
    create: (params, support) => {
        let owner: GoalMob | undefined;
        return {
            canStart: () => {
                if ((support.world.inventory?.() ?? []).length === 0) return false;
                owner = support.world.owner?.();
                return owner !== undefined;
            },
            canContinue: () => owner !== undefined && support.navigator.walking,
            start: () => {
                if (owner !== undefined) support.navigator.moveTo(owner.position(), params.runSpeed, 2);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                const keeper = owner;
                const item = support.world.inventory?.()[0];
                if (keeper !== undefined && item !== undefined) support.world.giveItem?.(keeper, item);
                support.playSound(params.throwSound);
                support.fireAll(params.onItemThrow);
                owner = undefined;
            },
            stop: () => {
                owner = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.go_and_give_items_to_noteblock`, which the allay
 * carries. It is the same delivery with the note block it heard as the
 * destination.
 */
export const goAndGiveItemsToNoteblock = goal<GiveItemsParams>({
    name: 'minecraft:behavior.go_and_give_items_to_noteblock',
    controlFlags: ['move'],
    schema: bodySchema(giveItemsFrom),
    create: (params, support) => {
        let walking = false;
        return {
            canStart: () => {
                if ((support.world.inventory?.() ?? []).length === 0) return false;
                const anchor = support.world.poi?.('noteblock', 32);
                if (anchor === undefined) return false;
                walking = support.navigator.moveTo(anchor, params.runSpeed, 2);
                return walking;
            },
            canContinue: () => walking,
            tick: () => {
                if (support.navigator.tick()) return;
                walking = false;
                const item = support.world.inventory?.()[0];
                if (item !== undefined) support.world.dropItem?.(item, support.position());
                support.playSound(params.throwSound);
                support.fireAll(params.onItemThrow);
            },
            stop: () => {
                walking = false;
                support.navigator.stop();
            }
        };
    }
});

/** Every goal in the social family. */
export const socialGoals: readonly RegisterableGoal[] = [
    breed,
    makeLove,
    receiveLove,
    followParent,
    tempt,
    floatTempt,
    followOwner,
    teleportToOwner,
    petSleepWithOwner,
    stayWhileSitting,
    findMount,
    playerRideTamed,
    controlledByPlayer,
    play,
    mingle,
    shareItems,
    beg,
    offerFlower,
    takeFlower,
    tradeWithPlayer,
    tradeInterest,
    barter,
    admireItem,
    dropItemFor,
    goAndGiveItemsToOwner,
    goAndGiveItemsToNoteblock
];
