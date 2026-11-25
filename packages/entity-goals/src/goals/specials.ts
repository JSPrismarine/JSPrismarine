import type { ControlFlag, EntityPosition, Goal } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import { centerOf } from '../navigation/view';
import type { GoalBody, GoalEvent, Range } from '../params';
import { bodySchema, eventAt, numberAt, stringAt, tickRangeAt, ticksAt } from '../params';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';
import type { DragonPhaseName } from './dragonPhases';
import { dragonPhasesOf } from './dragonPhases';
import { strollGoal } from './movement';
import { SLIME_HOP_REACH, slimeHeadingOf } from './slimeHeading';

/**
 * The goals exactly one entity uses.
 *
 * 91 of the 170 vanilla goals belong to a single entity, and the ones here
 * are the ones whose behavior is specific to that entity rather than a
 * variation on a shared shape: the ender dragon's eight flight phases, the
 * squid's five swimming states, the slime's jumping, the silverfish's stone
 * and the three generic timer flags.
 */

/** A goal that holds its flags for a drawn time and does nothing else. */
const phase = (support: GoalSupport, duration: Range, onStart?: () => void, onEnd?: () => void): Goal => {
    let remaining = 0;
    return {
        canStart: () => true,
        canContinue: () => remaining > 0,
        start: () => {
            remaining = support.between(duration[0], duration[1]);
            onStart?.();
        },
        tick: () => {
            remaining -= 1;
        },
        stop: () => {
            remaining = 0;
            onEnd?.();
        }
    };
};

/**
 * Builds one of the ender dragon's phase goals.
 *
 * All eight are `{"priority": n}` in the vanilla file and nothing else. Each one here runs while
 * the dragon's Java phase manager is in one of its phases, and ticks the manager, which runs the
 * phase and flies the dragon; see `dragonPhases.ts`.
 */
const dragonPhase = (
    name: string,
    controlFlags: readonly ControlFlag[],
    phases: readonly DragonPhaseName[]
): RegisterableGoal =>
    goal<GoalBody>({
        name: `minecraft:behavior.${name}`,
        controlFlags,
        schema: bodySchema((body) => body),
        create: (_params, support) => {
            const owns = (): boolean => phases.includes(dragonPhasesOf(support).phase);
            return {
                canStart: owns,
                canContinue: owns,
                tick: () => dragonPhasesOf(support).tick(),
                requiresUpdateEveryTick: () => true
            };
        }
    });

/** `minecraft:behavior.dragonholdingpattern`, Java's `DragonHoldingPatternPhase`: laps of the node rings. */
export const dragonHoldingPattern = dragonPhase('dragonholdingpattern', ['move'], ['holding_pattern']);

/** `minecraft:behavior.dragonscanning`, Java's `DragonSittingScanningPhase`: turning on the portal toward a player. */
export const dragonScanning = dragonPhase('dragonscanning', ['move', 'look'], ['sitting_scanning']);

/** `minecraft:behavior.dragonstrafeplayer`, Java's `DragonStrafePlayerPhase`: a fireball run at the target. */
export const dragonStrafePlayer = dragonPhase('dragonstrafeplayer', ['move', 'look'], ['strafe_player']);

/** `minecraft:behavior.dragonchargeplayer`, Java's `DragonChargePlayerPhase`: a dive at where a player stood. */
export const dragonChargePlayer = dragonPhase('dragonchargeplayer', ['move', 'look'], ['charging_player']);

/**
 * `minecraft:behavior.dragonlanding`, Java's `DragonLandingApproachPhase` and `DragonLandingPhase`:
 * the path in and the descent onto the exit portal.
 */
export const dragonLanding = dragonPhase('dragonlanding', ['move', 'look'], ['landing_approach', 'landing']);

/** `minecraft:behavior.dragontakeoff`, Java's `DragonTakeoffPhase`: the climb back off the portal. */
export const dragonTakeoff = dragonPhase('dragontakeoff', ['move'], ['takeoff']);

/**
 * `minecraft:behavior.dragonflaming`, Java's `DragonSittingAttackingPhase` and
 * `DragonSittingFlamingPhase`: the roar, then the breath.
 */
export const dragonFlaming = dragonPhase('dragonflaming', ['move', 'look'], ['sitting_attacking', 'sitting_flaming']);

/** How long Java's Ender Dragon death animation takes, in server ticks. */
const DRAGON_DEATH_TICKS = 200;

/** `minecraft:behavior.dragondeath`, which holds the dragon still until its death animation ends. */
export const dragonDeath = goal<GoalBody>({
    name: 'minecraft:behavior.dragondeath',
    controlFlags: ['move', 'look', 'jump'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        let remaining = 0;
        return {
            canStart: () => true,
            canContinue: () => remaining > 0,
            start: () => {
                remaining = DRAGON_DEATH_TICKS;
            },
            tick: () => {
                remaining -= 1;
                if (remaining === 0) support.world.removeSelf?.();
            },
            stop: () => {
                remaining = 0;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/**
 * Builds one of the squid's five swimming states.
 *
 * Like the dragon phases they are `{"priority": n}` and nothing more. A squid
 * has no path finder at all in vanilla: it drifts, so each state is a
 * duration over the move flag.
 */
const squidState = (name: string, duration: Range, speed: number): RegisterableGoal =>
    goal<GoalBody>({
        name: `minecraft:behavior.${name}`,
        controlFlags: ['move'],
        schema: bodySchema((body) => body),
        create: (_params, support) => {
            let remaining = 0;
            return {
                canStart: () => support.flag('in_water'),
                canContinue: () => remaining > 0 && support.flag('in_water'),
                start: () => {
                    remaining = support.between(duration[0], duration[1]);
                    if (speed === 0) {
                        support.navigator.stop();
                        return;
                    }
                    const here = support.position();
                    const angle = support.random() * Math.PI * 2;
                    support.navigator.moveTo(
                        {
                            x: here.x + Math.cos(angle) * speed * 4,
                            y: here.y + (support.random() - 0.5) * speed * 4,
                            z: here.z + Math.sin(angle) * speed * 4
                        },
                        speed,
                        1
                    );
                },
                tick: () => {
                    remaining -= 1;
                    support.navigator.tick();
                },
                stop: () => {
                    remaining = 0;
                    support.navigator.stop();
                }
            };
        }
    });

/** `minecraft:behavior.squid_idle`, the squid's default slow drift. */
export const squidIdle = squidState('squid_idle', [20, 60], 0.5);

/** `minecraft:behavior.squid_dive`, the squid's push toward deeper water. */
export const squidDive = squidState('squid_dive', [20, 40], 1);

/** How close the squid's attacker has to be for it to flee, Java's `distanceToSqr < 100`, in blocks. */
const SQUID_FLEE_RANGE = 10;

/** How long one flight lasts at most, from Java's `SquidFleeGoal.fleeTicks`, in ticks. */
const SQUID_FLEE_TICKS = 100;

/** How much faster than its drift a fleeing squid swims, Java's `SquidFleeGoal` scale of 3. */
const SQUID_FLEE_SPEED = 3;

/**
 * `minecraft:behavior.squid_flee`, the squid's burst away from a threat. Java's `SquidFleeGoal`:
 * while in water with the mob that last hurt it within 10 blocks, the squid swims straight away
 * from it at three times its drift, for up to 100 ticks per blow.
 */
export const squidFlee = goal<GoalBody>({
    name: 'minecraft:behavior.squid_flee',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        let remaining = 0;
        let attacker: GoalMob | undefined;
        /** The running damage total of the blow fled from, so the same blow does not start a second flight. */
        let fledFrom: number | undefined;
        const lastBlow = (): { readonly mob: GoalMob; readonly total: number } | undefined => {
            const last = support.world.damagers?.().at(-1);
            return last?.mob === undefined ? undefined : { mob: last.mob, total: last.total };
        };
        const away = (): void => {
            if (attacker === undefined) return;
            const here = support.position();
            const from = attacker.position();
            const dx = here.x - from.x;
            const dy = here.y - from.y;
            const dz = here.z - from.z;
            const length = Math.hypot(dx, dy, dz) || 1;
            const reach = SQUID_FLEE_SPEED * 2;
            const destination = {
                x: here.x + (dx / length) * reach,
                y: here.y + (dy / length) * reach,
                z: here.z + (dz / length) * reach
            };
            // Java's squid has no path finder and swims along its movement vector, so where no path
            // reaches the spot it is steered there directly.
            if (!support.navigator.moveTo(destination, SQUID_FLEE_SPEED, 1))
                support.actuator?.moveTo(destination, SQUID_FLEE_SPEED);
        };
        return {
            canStart: () => {
                const blow = lastBlow();
                if (!support.flag('in_water') || blow === undefined || blow.total === fledFrom) return false;
                if (support.distanceTo(blow.mob.position()) >= SQUID_FLEE_RANGE) return false;
                attacker = blow.mob;
                fledFrom = blow.total;
                return true;
            },
            canContinue: () =>
                remaining > 0 &&
                support.flag('in_water') &&
                attacker !== undefined &&
                support.distanceTo(attacker.position()) < SQUID_FLEE_RANGE,
            start: () => {
                remaining = SQUID_FLEE_TICKS;
                away();
            },
            tick: () => {
                remaining -= 1;
                if (remaining % 10 === 0) away();
                else support.navigator.tick();
            },
            stop: () => {
                remaining = 0;
                attacker = undefined;
                support.navigator.stop();
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/**
 * `minecraft:behavior.squid_move_away_from_ground`, which pushes a squid off
 * the sea floor so it does not get stuck there.
 */
export const squidMoveAwayFromGround = goal<GoalBody>({
    name: 'minecraft:behavior.squid_move_away_from_ground',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.flag('in_water') && support.flag('on_ground'),
        canContinue: () => support.navigator.walking,
        start: () => {
            const here = support.position();
            support.navigator.moveTo({ ...here, y: here.y + 4 }, 1, 1);
        },
        tick: () => {
            support.navigator.tick();
        },
        stop: () => {
            support.navigator.stop();
        }
    })
});

/**
 * `minecraft:behavior.squid_out_of_water`, which flops a beached squid. It
 * holds the move flag so nothing tries to path it while it is stranded.
 */
export const squidOutOfWater = goal<GoalBody>({
    name: 'minecraft:behavior.squid_out_of_water',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => !support.flag('in_water'),
        canContinue: () => !support.flag('in_water'),
        start: () => {
            support.navigator.stop();
        },
        tick: () => {
            if (support.chance(0.1)) support.actuator?.jump();
        }
    })
});

/**
 * `minecraft:behavior.slime_keep_on_jumping`, which the slime line carries. A
 * slime moves only by jumping, so this is its walk.
 *
 * Each landing is one hop: the goal jumps and sends the slime
 * {@link SLIME_HOP_REACH} blocks along the heading
 * {@link slimeHeadingOf} holds. Jumping alone leaves
 * the slime where it stands, which is what it used to do, and a host whose
 * actuator has no vertical impulse made that a slime that never moved at all.
 */
export const slimeKeepOnJumping = goal<{ readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.slime_keep_on_jumping',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) => ({
        canStart: () => true,
        canContinue: () => true,
        tick: () => {
            // The hop in flight first, so a landing is the only thing that aims a new one.
            if (support.navigator.tick()) return;
            if (!support.flag('on_ground')) return;

            support.actuator?.jump();
            const landing = slimeHeadingOf(support.entity).ahead(support.position(), SLIME_HOP_REACH);
            if (landing !== undefined) support.navigator.moveTo(landing, params.speedMultiplier, 0);
        },
        stop: () => {
            support.navigator.stop();
        }
    })
});

/** What `minecraft:behavior.slime_random_direction` declares. */
export interface SlimeRandomDirectionParams {
    /** The least time the slime keeps one heading, in ticks. */
    readonly minChangeDirectionTime: number;
    /** How much longer it may keep it, in ticks. */
    readonly addRandomTimeRange: number;
    /** How far the heading may turn, in degrees. */
    readonly turnRange: number;
}

/**
 * `minecraft:behavior.slime_random_direction`, which the slime line carries.
 * It picks the heading that `slime_keep_on_jumping` then jumps along, and
 * holds it for the drawn time so the slime travels rather than jittering.
 */
export const slimeRandomDirection = goal<SlimeRandomDirectionParams>({
    name: 'minecraft:behavior.slime_random_direction',
    controlFlags: ['look'],
    schema: bodySchema((body) => ({
        minChangeDirectionTime: ticksAt(body, 'min_change_direction_time', 2),
        addRandomTimeRange: numberAt(body, 'add_random_time_range', 3),
        turnRange: numberAt(body, 'turn_range', 360)
    })),
    create: (params, support) => {
        let remaining = 0;
        return {
            canStart: () => true,
            canContinue: () => remaining > 0,
            start: () => {
                remaining =
                    params.minChangeDirectionTime + Math.round(support.random() * params.addRandomTimeRange * 20);
                // Java's `SlimeRandomDirectionGoal` only hands the direction to the move control,
                // which turns the body toward it by `rotlerp(yaw, direction, 90)` a tick.
                const angle = ((support.random() * params.turnRange - params.turnRange / 2) * Math.PI) / 180;
                slimeHeadingOf(support.entity).set(angle);
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
 * The blocks a silverfish can hide in, with the infested block each becomes. Java's
 * `InfestedBlock.isCompatibleHostBlock` and `infestedStateByHost`.
 */
const INFESTED_BY_HOST: ReadonlyMap<string, string> = new Map([
    ['minecraft:stone', 'minecraft:infested_stone'],
    ['minecraft:cobblestone', 'minecraft:infested_cobblestone'],
    ['minecraft:stone_bricks', 'minecraft:infested_stone_bricks'],
    ['minecraft:mossy_stone_bricks', 'minecraft:infested_mossy_stone_bricks'],
    ['minecraft:cracked_stone_bricks', 'minecraft:infested_cracked_stone_bricks'],
    ['minecraft:chiseled_stone_bricks', 'minecraft:infested_chiseled_stone_bricks'],
    ['minecraft:deepslate', 'minecraft:infested_deepslate']
]);

/** The host block each infested block was made from, for waking a nest without griefing. */
const HOST_BY_INFESTED: ReadonlyMap<string, string> = new Map(
    [...INFESTED_BY_HOST].map(([host, infested]) => [infested, host])
);

/** The six face directions, in Java's `Direction` order: down, up, north, south, west, east. */
const FACES: readonly (readonly [number, number, number])[] = [
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
    [-1, 0, 0],
    [1, 0, 0]
];

/**
 * Java's `SilverfishMergeWithStoneGoal` stroll: `super(mob, 1.0, 10)` over `RandomStrollGoal`'s
 * default box, 10 blocks across and 7 up and down.
 */
const SILVERFISH_STROLL = { speedMultiplier: 1, xzDistance: 10, yDistance: 7, interval: 10 } as const;

/**
 * `minecraft:behavior.silverfish_merge_with_stone`, which the silverfish carries. Java's
 * `SilverfishMergeWithStoneGoal`: with no target and nothing to walk to, one goal check in five
 * looks at the block on one random face and, when it can host a silverfish, the silverfish turns
 * it into the infested block and disappears. The Java goal extends `RandomStrollGoal`, so a check
 * that finds nothing to hide in wanders instead, one check in five with `mobGriefing` off too.
 */
export const silverfishMergeWithStone = goal<GoalBody>({
    name: 'minecraft:behavior.silverfish_merge_with_stone',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        const stroll = strollGoal(SILVERFISH_STROLL, support);
        let host: { readonly position: EntityPosition; readonly infested: string } | undefined;
        /** The infested block on one random face, when that face can host a silverfish. */
        const findHost = (): typeof host => {
            if (support.world.gameRule?.('mobGriefing') === false) return undefined;
            // reducedTickDelay(10) is 5 goal checks, one in which succeeds.
            if (support.randomInt(5) !== 0) return undefined;
            const [dx, dy, dz] = FACES[support.randomInt(FACES.length)] ?? [0, -1, 0];
            const here = support.position();
            const cell = {
                x: Math.floor(here.x) + dx,
                y: Math.floor(here.y + 0.5) + dy,
                z: Math.floor(here.z) + dz
            };
            const found = (
                support.world.blocks?.({ identifiers: [...INFESTED_BY_HOST.keys()], range: 1, height: 1 }) ?? []
            ).find(
                (block) =>
                    Math.floor(block.position.x) === cell.x &&
                    Math.floor(block.position.y) === cell.y &&
                    Math.floor(block.position.z) === cell.z
            );
            const infested = found === undefined ? undefined : INFESTED_BY_HOST.get(found.identifier);
            return found === undefined || infested === undefined ? undefined : { position: found.position, infested };
        };
        return {
            canStart: () => {
                host = undefined;
                if (support.target() !== undefined || support.navigator.walking) return false;
                host = findHost();
                return host !== undefined || stroll.canStart();
            },
            canContinue: () => host === undefined && (stroll.canContinue?.() ?? false),
            start: () => {
                if (host === undefined) {
                    stroll.start?.();
                    return;
                }
                support.world.setBlock?.(host.position, host.infested);
                support.entity.remove('minecraft:behavior.silverfish_merge_with_stone');
            },
            tick: () => {
                if (host === undefined) stroll.tick?.();
            },
            stop: () => {
                if (host === undefined) stroll.stop?.();
                host = undefined;
            }
        };
    }
});

/** The y offsets Java's wake-up scan visits, nearest first: 0, 1, -1, 2, -2 and so on. */
const nearestFirst = (reach: number): readonly number[] => {
    const offsets = [0];
    for (let step = 1; step <= reach; step += 1) offsets.push(step, -step);
    return offsets;
};

/**
 * `minecraft:behavior.silverfish_wake_up_friends`, which the silverfish carries. Java's
 * `SilverfishWakeUpFriendsGoal`: 20 ticks after a silverfish is hurt by an attacker, it scans
 * 10 blocks across and 5 up and down, nearest first, and breaks each infested block it finds,
 * which lets the silverfish inside out. After each block a coin flip ends the scan. With
 * `mobGriefing` off the block turns back into its host and nothing comes out.
 */
export const silverfishWakeUpFriends = goal<GoalBody>({
    name: 'minecraft:behavior.silverfish_wake_up_friends',
    controlFlags: [],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        /** How long the call takes to go out, `adjustedTickDelay(20)`. */
        const delay = 20;
        let seen = 0;
        let lookForFriends = 0;
        return {
            canStart: () => {
                const hurt = (support.world.damagers?.() ?? []).reduce(
                    (sum, damage) => sum + (damage.mob === undefined ? 0 : damage.total),
                    0
                );
                const fresh = hurt > seen;
                seen = hurt;
                if (fresh) lookForFriends = delay;
                return lookForFriends > 0;
            },
            canContinue: () => lookForFriends > 0,
            tick: () => {
                lookForFriends -= 1;
                if (lookForFriends > 0) return;
                const here = support.position();
                const origin = { x: Math.floor(here.x), y: Math.floor(here.y), z: Math.floor(here.z) };
                const nests =
                    support.world.blocks?.({ identifiers: [...HOST_BY_INFESTED.keys()], range: 10, height: 5 }) ?? [];
                const at = new Map(
                    nests.map((nest) => [
                        `${Math.floor(nest.position.x)},${Math.floor(nest.position.y)},${Math.floor(nest.position.z)}`,
                        nest
                    ])
                );
                const griefing = support.world.gameRule?.('mobGriefing') !== false;
                for (const dy of nearestFirst(5))
                    for (const dx of nearestFirst(10))
                        for (const dz of nearestFirst(10)) {
                            const nest = at.get(`${origin.x + dx},${origin.y + dy},${origin.z + dz}`);
                            if (nest === undefined) continue;
                            if (griefing) {
                                support.world.breakBlock?.(nest.position);
                                support.world.spawn?.('minecraft:silverfish', centerOf(nest.position), undefined);
                            } else {
                                support.world.setBlock?.(
                                    nest.position,
                                    HOST_BY_INFESTED.get(nest.identifier) ?? 'minecraft:stone'
                                );
                            }
                            if (support.random() < 0.5) return;
                        }
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.skeleton_horse_trap` declares. */
export interface SkeletonHorseTrapParams {
    /** How long the trap stays armed before the horse is gone, in ticks. */
    readonly duration: number;
    /** How close a player has to come, in blocks. */
    readonly withinRadius: number;
}

/** A trap's saved state: when it was first seen armed, and whether it has been sprung. */
const trapState = defineComponentState('minecraft:behavior.skeleton_horse_trap', {
    armedAt: stateField.number,
    sprung: stateField.boolean
});

/** How many skeleton horsemen ride in beside the trap horse, Java's `SkeletonTrapGoal.tick` loop. */
const TRAP_HORSEMEN = 3;

/** The provider `SkeletonTrapGoal.enchant` draws each skeleton's bow and helmet enchantments from. */
const TRAP_ENCHANTMENT_PROVIDER = 'minecraft:mob_spawn_equipment';

/** The spread of the horsemen's push, Java's `triangle(0.0, 1.1485)` on each horizontal axis. */
const TRAP_HORSEMAN_SPREAD = 1.1485;

/**
 * The event the trap's horses run, which makes a skeleton horse an adult that a skeleton can ride
 * and that lightning does not hurt. The vanilla file declares it and nothing in the file fires it:
 * it is the event Bedrock's trap runs.
 */
const SPRING_TRAP_EVENT = 'minecraft:spring_trap';

/**
 * `minecraft:behavior.skeleton_horse_trap`, which the skeleton horse carries: Java's
 * `SkeletonTrapGoal`.
 *
 * Once a player comes within the radius the trap springs, once: a visual-only lightning bolt
 * strikes the horse, the horse becomes a rideable adult with a skeleton on its back, and three
 * more skeleton horses, each with a skeleton rider, spawn beside it and scatter. Every skeleton
 * wears an iron helmet when its own equipment left its head bare, and its bow and helmet are
 * enchanted from the `mob_spawn_equipment` provider. A trap nobody springs within its
 * duration takes the horse away, as Java's `SkeletonHorse.aiStep` discards a trap horse after
 * 18000 ticks. The trap's state is component state, so a sprung trap stays sprung across a save.
 *
 * The riders come the tick after the strike, once the horse's `spring_trap` event has made it
 * rideable.
 */
export const skeletonHorseTrap = goal<SkeletonHorseTrapParams>({
    name: 'minecraft:behavior.skeleton_horse_trap',
    controlFlags: [],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 900),
        withinRadius: numberAt(body, 'within_radius', 10)
    })),
    create: (params, support) => {
        const states = support.entity.componentState;
        let ridersDue = false;
        let ticked = 0;

        const triangle = (): number => TRAP_HORSEMAN_SPREAD * (support.random() - support.random());
        const horseman = (horse: GoalMob, at: EntityPosition): void => {
            support.world.spawn?.('minecraft:skeleton', at, undefined, {
                rides: horse,
                fillEmptySlots: { head: 'minecraft:iron_helmet' },
                enchantFromProvider: { provider: TRAP_ENCHANTMENT_PROVIDER, slots: ['mainhand', 'head'] }
            });
        };

        return {
            canStart: () => {
                const state = states.get(trapState);
                if (state?.sprung === true) return false;
                const now = support.world.gameTime?.();
                if (now !== undefined) {
                    if (state === undefined) states.set(trapState, { armedAt: now, sprung: false });
                    else if (now - state.armedAt >= params.duration) {
                        support.world.removeSelf?.();
                        return false;
                    }
                }
                return support.nearestPlayer(params.withinRadius) !== undefined;
            },
            canContinue: () => ridersDue,
            start: () => {
                const here = support.position();
                states.set(trapState, { armedAt: states.get(trapState)?.armedAt ?? 0, sprung: true });
                support.entity.fire(SPRING_TRAP_EVENT);
                support.world.spawn?.('minecraft:lightning_bolt', here, undefined, { data: { visual_only: true } });
                ridersDue = true;
                ticked = 0;
            },
            tick: () => {
                ticked += 1;
                if (!ridersDue || ticked < 2) return;
                ridersDue = false;
                const here = support.position();
                const self = support.world.self?.();
                if (self !== undefined) horseman(self, here);
                for (let index = 0; index < TRAP_HORSEMEN; index += 1) {
                    const horse = support.world.spawn?.('minecraft:skeleton_horse', here, SPRING_TRAP_EVENT, {
                        velocity: { x: triangle(), y: 0, z: triangle() }
                    });
                    if (horse !== undefined) horseman(horse, here);
                }
            },
            stop: () => {
                ridersDue = false;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.emerge` declares. */
export interface EmergeParams {
    /** How long the emerge animation lasts, in ticks. */
    readonly duration: number;
    readonly onDone: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.emerge`, which the warden carries. The warden is
 * immobile while it rises out of the ground, so the goal takes every control
 * flag.
 */
export const emerge = goal<EmergeParams>({
    name: 'minecraft:behavior.emerge',
    controlFlags: ['move', 'look', 'jump'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 7),
        onDone: eventAt(body, 'on_done')
    })),
    create: (params, support) =>
        phase(
            support,
            [params.duration, params.duration],
            () => support.navigator.stop(),
            () => support.fire(params.onDone)
        )
});

/** What `minecraft:behavior.celebrate` declares. */
export interface CelebrateParams {
    /** How long the celebration lasts, in ticks. */
    readonly duration: number;
    /** How long between jumps, in ticks. */
    readonly jumpInterval: Range;
    /** How long between sounds, in ticks. */
    readonly soundInterval: Range;
    readonly celebrationSound: string | undefined;
    readonly onCelebrationEnd: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.celebrate`, which the five raid entities carry. The
 * entity jumps and shouts after a raid is won.
 */
export const celebrate = goal<CelebrateParams>({
    name: 'minecraft:behavior.celebrate',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 30),
        jumpInterval: tickRangeAt(body, 'jump_interval', [1, 3]),
        soundInterval: tickRangeAt(body, 'sound_interval', [2, 5]),
        celebrationSound: stringAt(body, 'celebration_sound'),
        onCelebrationEnd: eventAt(body, 'on_celebration_end_event')
    })),
    create: (params, support) => {
        let remaining = 0;
        let jumpTimer = 0;
        let soundTimer = 0;

        return {
            canStart: () => true,
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                jumpTimer = support.between(params.jumpInterval[0], params.jumpInterval[1]);
                soundTimer = support.between(params.soundInterval[0], params.soundInterval[1]);
            },
            tick: () => {
                remaining -= 1;
                if ((jumpTimer -= 1) <= 0) {
                    jumpTimer = support.between(params.jumpInterval[0], params.jumpInterval[1]);
                    support.actuator?.jump();
                }
                if ((soundTimer -= 1) <= 0) {
                    soundTimer = support.between(params.soundInterval[0], params.soundInterval[1]);
                    support.playSound(params.celebrationSound);
                }
            },
            stop: () => {
                remaining = 0;
                support.fire(params.onCelebrationEnd);
            }
        };
    }
});

/** What `minecraft:behavior.celebrate_survive` declares. */
export interface CelebrateSurviveParams {
    /** How long the celebration lasts, in ticks. */
    readonly duration: number;
    /** How long between fireworks, in ticks. */
    readonly fireworksInterval: Range;
    readonly onCelebrationEnd: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.celebrate_survive`, which the villager and the iron
 * golem carry. Surviving a raid is celebrated with fireworks rather than
 * jumping.
 */
export const celebrateSurvive = goal<CelebrateSurviveParams>({
    name: 'minecraft:behavior.celebrate_survive',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 30),
        fireworksInterval: tickRangeAt(body, 'fireworks_interval', [2, 7]),
        onCelebrationEnd: eventAt(body, 'on_celebration_end_event')
    })),
    create: (params, support) => {
        let remaining = 0;
        let fireworkTimer = 0;

        return {
            canStart: () => true,
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                fireworkTimer = support.between(params.fireworksInterval[0], params.fireworksInterval[1]);
            },
            tick: () => {
                remaining -= 1;
                if ((fireworkTimer -= 1) > 0) return;
                fireworkTimer = support.between(params.fireworksInterval[0], params.fireworksInterval[1]);
                support.world.spawn?.('minecraft:fireworks_rocket', support.position(), undefined);
            },
            stop: () => {
                remaining = 0;
                support.fire(params.onCelebrationEnd);
            }
        };
    }
});

/** What the three timer flag goals declare. */
export interface TimerFlagParams {
    /** How long the flag stays up, in ticks. */
    readonly duration: Range;
    /** How long it stays down, in ticks. */
    readonly cooldown: Range;
    readonly onStart: GoalEvent | undefined;
    readonly onEnd: GoalEvent | undefined;
}

/**
 * Builds one of the three `minecraft:behavior.timer_flag_*` goals.
 *
 * They are the only goals with no behavior of their own: the entity file uses
 * them as a clock that raises an animation flag and fires an event at each
 * end, and `control_flags` on the component decides what the raised flag
 * blocks. Six vanilla entities use them, for the panda's sitting, the
 * villager's work pose and the frog's tongue.
 */
const timerFlag = (index: number): RegisterableGoal =>
    goal<TimerFlagParams>({
        name: `minecraft:behavior.timer_flag_${index}`,
        controlFlags: ['move', 'look'],
        schema: bodySchema((body) => ({
            duration: tickRangeAt(body, 'duration_range', [2, 2]),
            cooldown: tickRangeAt(body, 'cooldown_range', [10, 10]),
            onStart: eventAt(body, 'on_start'),
            onEnd: eventAt(body, 'on_end')
        })),
        create: (params, support) => {
            let remaining = 0;
            let cooldown = 0;
            return {
                canStart: () => {
                    if (cooldown > 0) {
                        cooldown -= 1;
                        return false;
                    }
                    return true;
                },
                canContinue: () => remaining > 0,
                start: () => {
                    remaining = support.between(params.duration[0], params.duration[1]);
                    support.fire(params.onStart);
                },
                tick: () => {
                    remaining -= 1;
                },
                stop: () => {
                    remaining = 0;
                    cooldown = support.between(params.cooldown[0], params.cooldown[1]);
                    support.fire(params.onEnd);
                }
            };
        }
    });

/** `minecraft:behavior.timer_flag_1`, which four vanilla entities carry. */
export const timerFlag1 = timerFlag(1);

/** `minecraft:behavior.timer_flag_2`, which the villager carries. */
export const timerFlag2 = timerFlag(2);

/** `minecraft:behavior.timer_flag_3`, which the villager carries. */
export const timerFlag3 = timerFlag(3);

/** Every goal in the single-entity family. */
export const specialGoals: readonly RegisterableGoal[] = [
    dragonHoldingPattern,
    dragonScanning,
    dragonStrafePlayer,
    dragonChargePlayer,
    dragonLanding,
    dragonTakeoff,
    dragonFlaming,
    dragonDeath,
    squidIdle,
    squidDive,
    squidFlee,
    squidMoveAwayFromGround,
    squidOutOfWater,
    slimeKeepOnJumping,
    slimeRandomDirection,
    silverfishMergeWithStone,
    silverfishWakeUpFriends,
    skeletonHorseTrap,
    emerge,
    celebrate,
    celebrateSurvive,
    timerFlag1,
    timerFlag2,
    timerFlag3
];
