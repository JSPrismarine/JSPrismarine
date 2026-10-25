import type { EntityPosition, Goal } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import { centerOf } from '../navigation/view';
import type { GoalEvent, Range, TargetEntityType } from '../params';
import {
    bodySchema,
    booleanAt,
    entityTypesAt,
    eventAt,
    filterAt,
    numberAt,
    recordsAt,
    stringAt,
    stringsAt,
    tickRangeAt,
    ticksAt
} from '../params';
import type { GoalSupport } from '../support';

/**
 * The goals about the world around the entity rather than another entity:
 * sleeping, hiding, sitting, eating a block and the idle animations.
 *
 * Most of them are a condition plus a timer, so the shared helper here is
 * {@link holdStill}: take the control flags, stand there for a drawn time and
 * fire the event the body names at the end.
 */

/** How long the sheep's eat animation lasts, from Java's `EatBlockGoal.EAT_ANIMATION_TICKS`. */
const EAT_ANIMATION_TICKS = 40;

/** How often an adult sheep looks for grass, from Java's `EatBlockGoal.canUse`. */
const ADULT_EAT_INTERVAL = 1000;

/** How often a lamb does, from the same method. */
const BABY_EAT_INTERVAL = 50;

/** How a standing-still goal is parameterized. */
interface HoldStillOptions {
    /** Whether the goal may start now. */
    ready(): boolean;
    /** How long it holds, in ticks. */
    readonly duration: Range;
    /** How long before it may run again, in ticks. */
    readonly cooldown: Range;
    /** The chance per attempt that it runs, in [0, 1]. */
    readonly probability: number;
    onStart?(): void;
    onEnd?(): void;
}

/** The shared loop: wait out a cooldown, hold still for a drawn time, fire the end event. */
const holdStill = (support: GoalSupport, options: HoldStillOptions): Goal => {
    let remaining = 0;
    let cooldown = 0;

    return {
        canStart: () => {
            if (cooldown > 0) {
                cooldown -= 1;
                return false;
            }
            if (!support.chance(options.probability)) return false;
            return options.ready();
        },
        canContinue: () => remaining > 0,
        start: () => {
            remaining = support.between(options.duration[0], options.duration[1]);
            support.navigator.stop();
            options.onStart?.();
        },
        tick: () => {
            remaining -= 1;
        },
        stop: () => {
            remaining = 0;
            cooldown = support.between(options.cooldown[0], options.cooldown[1]);
            options.onEnd?.();
        }
    };
};

/** What `minecraft:behavior.sleep` declares. */
export interface SleepParams {
    readonly speedMultiplier: number;
    /** How long before the goal may run again after it fails, in ticks. */
    readonly timeoutCooldown: number;
    /** How tall the entity's collision box is while it sleeps, in blocks. */
    readonly colliderHeight: number;
    /** How wide it is, in blocks. */
    readonly colliderWidth: number;
    /** How far below the bed the entity sits while asleep, in blocks. */
    readonly yOffset: number;
}

/**
 * `minecraft:behavior.sleep`, which the villager carries. The entity walks to
 * its bed at night and stays there until morning.
 */
export const sleep = goal<SleepParams>({
    name: 'minecraft:behavior.sleep',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        timeoutCooldown: ticksAt(body, 'timeout_cooldown', 8),
        colliderHeight: numberAt(body, 'sleep_collider_height', 0.3),
        colliderWidth: numberAt(body, 'sleep_collider_width', 1),
        yOffset: numberAt(body, 'sleep_y_offset', 0)
    })),
    create: (params, support) => {
        let bed: EntityPosition | undefined;
        let sleeping = false;
        let cooldown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (!support.isNight()) return false;
                bed = support.world.poi?.('bed', 32);
                if (bed === undefined) cooldown = params.timeoutCooldown;
                return bed !== undefined;
            },
            canContinue: () => support.isNight() && bed !== undefined,
            start: () => {
                sleeping = false;
                if (bed !== undefined) support.navigator.moveTo(bed, params.speedMultiplier, 1);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (sleeping) return;
                sleeping = true;
                support.world.setSleeping?.(true);
            },
            stop: () => {
                if (sleeping) support.world.setSleeping?.(false);
                sleeping = false;
                bed = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.nap` declares. */
export interface NapParams {
    /** How long before the entity naps again, in ticks. */
    readonly cooldown: Range;
    /** How far a mob has to be for the entity to feel safe, in blocks. */
    readonly mobDetectDistance: number;
    /** How far above and below it looks, in blocks. */
    readonly mobDetectHeight: number;
    /** What has to be true for the entity to nap at all. */
    readonly canNapFilters: Filter | undefined;
    /** Mobs whose presence does not wake the entity. */
    readonly wakeMobExceptions: Filter | undefined;
}

/**
 * `minecraft:behavior.nap`, which the fox carries. The entity sleeps where it
 * stands in daylight and wakes when something comes near.
 */
export const nap = goal<NapParams>({
    name: 'minecraft:behavior.nap',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        cooldown: [ticksAt(body, 'cooldown_min', 2), ticksAt(body, 'cooldown_max', 7)] as const,
        mobDetectDistance: numberAt(body, 'mob_detect_dist', 6),
        mobDetectHeight: numberAt(body, 'mob_detect_height', 6),
        canNapFilters: filterAt(body, 'can_nap_filters'),
        wakeMobExceptions: filterAt(body, 'wake_mob_exceptions')
    })),
    create: (params, support) => {
        let napping = false;
        let cooldown = 0;

        // With no `wake_mob_exceptions` every mob wakes the entity, so the
        // absent filter cannot be read as one that accepts everything.
        const disturbed = (): boolean =>
            support
                .mobs(params.mobDetectDistance)
                .some(
                    (mob) => params.wakeMobExceptions === undefined || !support.matches(params.wakeMobExceptions, mob)
                );

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (!support.matches(params.canNapFilters)) return false;
                return !disturbed();
            },
            canContinue: () => napping && !disturbed() && support.matches(params.canNapFilters),
            start: () => {
                napping = true;
                support.navigator.stop();
                support.world.setSleeping?.(true);
            },
            stop: () => {
                napping = false;
                cooldown = support.between(params.cooldown[0], params.cooldown[1]);
                support.world.setSleeping?.(false);
            }
        };
    }
});

/** What `minecraft:behavior.hide` declares. */
export interface HideParams {
    readonly speedMultiplier: number;
    /** How long the entity stays hidden, in ticks. */
    readonly duration: number;
    /** The point of interest type that counts as cover. */
    readonly poiType: string | undefined;
}

/**
 * `minecraft:behavior.hide`, which the villager carries. A raid bell sends
 * villagers to the nearest house, which is the point of interest named here.
 */
export const hide = goal<HideParams>({
    name: 'minecraft:behavior.hide',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        duration: ticksAt(body, 'duration', 30),
        poiType: stringAt(body, 'poi_type')
    })),
    create: (params, support) => {
        let shelter: EntityPosition | undefined;
        let remaining = 0;

        return {
            canStart: () => {
                shelter = support.world.poi?.(params.poiType ?? 'bed', 32);
                return shelter !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                if (shelter !== undefined) support.navigator.moveTo(shelter, params.speedMultiplier, 1);
            },
            tick: () => {
                remaining -= 1;
                support.navigator.tick();
            },
            stop: () => {
                remaining = 0;
                shelter = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.lay_down` declares. */
export interface LayDownParams {
    /** One tick in this many lies down. */
    readonly interval: number;
    /** One tick in this many gets up again. */
    readonly randomStopInterval: number;
}

/**
 * `minecraft:behavior.lay_down`, which the panda carries. It is a lie-down
 * with no timer: the entity gets up on a random roll rather than after a set
 * time.
 */
export const layDown = goal<LayDownParams>({
    name: 'minecraft:behavior.lay_down',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        interval: numberAt(body, 'interval', 120),
        randomStopInterval: numberAt(body, 'random_stop_interval', 120)
    })),
    create: (params, support) => ({
        canStart: () => params.interval > 0 && support.chance(1 / params.interval),
        canContinue: () => params.randomStopInterval <= 0 || !support.chance(1 / params.randomStopInterval),
        start: () => {
            support.navigator.stop();
            support.world.setSitting?.(true);
        },
        stop: () => {
            support.world.setSitting?.(false);
        }
    })
});

/** What `minecraft:behavior.random_sitting` declares. */
export interface RandomSittingParams {
    /** How long before the entity may sit again, in ticks. */
    readonly cooldown: number;
    /** The least time one sitting lasts, in ticks. */
    readonly minSitTime: number;
    /** The chance per tick of sitting down, in [0, 1]. */
    readonly startChance: number;
    /** The chance per tick of standing up again, in [0, 1]. */
    readonly stopChance: number;
}

/**
 * `minecraft:behavior.random_sitting`, which the panda carries. It is
 * `lay_down` with a minimum time, so the entity cannot stand up the tick
 * after it sat.
 */
export const randomSitting = goal<RandomSittingParams>({
    name: 'minecraft:behavior.random_sitting',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        cooldown: ticksAt(body, 'cooldown', 0),
        minSitTime: ticksAt(body, 'min_sit_time', 10),
        startChance: numberAt(body, 'start_chance', 0.1),
        stopChance: numberAt(body, 'stop_chance', 0.3)
    })),
    create: (params, support) => {
        let sat = 0;
        let cooldown = 0;
        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                return support.chance(params.startChance);
            },
            canContinue: () => sat < params.minSitTime || !support.chance(params.stopChance),
            start: () => {
                sat = 0;
                support.navigator.stop();
                support.world.setSitting?.(true);
            },
            tick: () => {
                sat += 1;
            },
            stop: () => {
                sat = 0;
                cooldown = params.cooldown;
                support.world.setSitting?.(false);
            }
        };
    }
});

/**
 * `minecraft:behavior.ocelot_sit_on_block`, which the cat and the ocelot
 * carry. The entity finds a chest, a furnace or a bed and sits on top of it.
 */
export const ocelotSitOnBlock = goal<{ readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.ocelot_sit_on_block',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) => {
        /** The blocks a cat sits on, which the vanilla cat picks between. */
        const perches = ['minecraft:chest', 'minecraft:furnace', 'minecraft:bed'];
        let perch: EntityPosition | undefined;
        let sitting = false;

        return {
            canStart: () => {
                const found = support.world.blocks?.({ identifiers: perches, range: 8, height: 4 })[0];
                perch = found === undefined ? undefined : centerOf({ ...found.position, y: found.position.y + 1 });
                return perch !== undefined;
            },
            canContinue: () => perch !== undefined,
            start: () => {
                sitting = false;
                if (perch !== undefined) support.navigator.moveTo(perch, params.speedMultiplier, 1);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (sitting) return;
                sitting = true;
                support.world.setSitting?.(true);
            },
            stop: () => {
                if (sitting) support.world.setSitting?.(false);
                sitting = false;
                perch = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** One `eat_and_replace_block_pairs` entry: what the entity eats and what is left. */
export interface EatBlockPair {
    /** The block the entity eats. */
    readonly eatBlock: string;
    /** What stands there afterward. */
    readonly replaceBlock: string;
}

/** What `minecraft:behavior.eat_block` declares. */
export interface EatBlockParams {
    /** The blocks the entity eats, each with its replacement. */
    readonly pairs: readonly EatBlockPair[];
    /** How long one mouthful takes, in ticks. */
    readonly timeUntilEat: number;
    /** The Molang expression deciding whether one attempt works. */
    readonly successChance: string | undefined;
    readonly onEat: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.eat_block`, which the sheep carries.
 *
 * Java's `EatBlockGoal` runs a 40-tick animation and starts on a 1-in-1000
 * chance per tick for an adult, 1 in 50 for a lamb, which is what the
 * `success_chance` expression spells in Bedrock.
 */
export const eatBlock = goal<EatBlockParams>({
    name: 'minecraft:behavior.eat_block',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        pairs: recordsAt(body, 'eat_and_replace_block_pairs').map((pair) => ({
            eatBlock: stringAt(pair, 'eat_block') ?? '',
            replaceBlock: stringAt(pair, 'replace_block') ?? 'minecraft:air'
        })),
        timeUntilEat: ticksAt(body, 'time_until_eat', EAT_ANIMATION_TICKS / 20),
        successChance: stringAt(body, 'success_chance'),
        onEat: eventAt(body, 'on_eat')
    })),
    create: (params, support) => {
        let mouthful: EatBlockPair | undefined;
        let block: EntityPosition | undefined;
        let remaining = 0;

        return {
            canStart: () => {
                const interval = support.flag('is_baby') ? BABY_EAT_INTERVAL : ADULT_EAT_INTERVAL;
                if (!support.chance(1 / interval)) return false;
                for (const pair of params.pairs) {
                    const found = support.world.blocks?.({ identifiers: [pair.eatBlock], range: 1, height: 1 })[0];
                    if (found === undefined) continue;
                    mouthful = pair;
                    block = found.position;
                    return true;
                }
                return false;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.timeUntilEat;
                support.navigator.stop();
            },
            tick: () => {
                if ((remaining -= 1) > 0) return;
                if (block !== undefined && mouthful !== undefined)
                    support.world.setBlock?.(block, mouthful.replaceBlock);
                support.fire(params.onEat);
            },
            stop: () => {
                remaining = 0;
                block = undefined;
                mouthful = undefined;
            }
        };
    }
});

/**
 * `minecraft:behavior.eat_carried_item`, which the fox carries. The entity
 * eats whatever food it picked up after the delay runs out.
 */
export const eatCarriedItem = goal<{ readonly delayBeforeEating: number }>({
    name: 'minecraft:behavior.eat_carried_item',
    controlFlags: [],
    schema: bodySchema((body) => ({ delayBeforeEating: ticksAt(body, 'delay_before_eating', 2) })),
    create: (params, support) => {
        let remaining = 0;
        return {
            canStart: () => support.world.carriedItem?.() !== undefined,
            canContinue: () => remaining > 0 && support.world.carriedItem?.() !== undefined,
            start: () => {
                remaining = params.delayBeforeEating;
            },
            tick: () => {
                if ((remaining -= 1) > 0) return;
                support.world.setCarriedItem?.(undefined);
            },
            stop: () => {
                remaining = 0;
            }
        };
    }
});

/**
 * `minecraft:behavior.drink_milk`, which the baby zombie villager carries. It
 * is the cure, and the `filters` decide when it may run.
 */
export const drinkMilk = goal<{ readonly filters: Filter | undefined }>({
    name: 'minecraft:behavior.drink_milk',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ filters: filterAt(body, 'filters') })),
    create: (params, support) => {
        /** How long drinking takes, which is the vanilla item use time. */
        const drinkTicks = 35;
        let remaining = 0;
        return {
            canStart: () => support.matches(params.filters),
            canContinue: () => remaining > 0,
            start: () => {
                remaining = drinkTicks;
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

/** What `minecraft:behavior.snacking` declares. */
export interface SnackingParams {
    /** The items the entity snacks on. */
    readonly items: readonly string[];
    /** How long before it snacks again, in ticks. */
    readonly cooldown: Range;
    /** The chance per tick of stopping, in [0, 1]. */
    readonly stopChance: number;
}

/**
 * `minecraft:behavior.snacking`, which the panda carries. The panda sits down
 * with the bamboo it holds and chews until it loses interest.
 */
export const snacking = goal<SnackingParams>({
    name: 'minecraft:behavior.snacking',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        items: stringsAt(body, 'items'),
        cooldown: [ticksAt(body, 'snacking_cooldown_min', 0.5), ticksAt(body, 'snacking_cooldown', 1)] as const,
        stopChance: numberAt(body, 'snacking_stop_chance', 0.0017)
    })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => {
                const held = support.world.carriedItem?.();
                return held !== undefined && params.items.includes(held);
            },
            // `snacking_stop_chance` is a per-tick roll in vanilla; drawing the
            // sitting time from it up front gives the same expected length.
            duration: [20, params.stopChance > 0 ? Math.round(1 / params.stopChance) : 200],
            cooldown: params.cooldown,
            probability: 1,
            onStart: () => support.world.setSitting?.(true),
            onEnd: () => support.world.setSitting?.(false)
        })
});

/** What `minecraft:behavior.croak` declares. */
export interface CroakParams {
    /** How long one croak lasts, in ticks. */
    readonly duration: Range;
    /** How long between croaks, in ticks. */
    readonly interval: Range;
    /** What has to be true for the entity to croak. */
    readonly filters: Filter | undefined;
}

/**
 * `minecraft:behavior.croak`, which the frog carries. It is the idle
 * animation, and the filters keep it on land.
 */
export const croak = goal<CroakParams>({
    name: 'minecraft:behavior.croak',
    controlFlags: ['look'],
    schema: bodySchema((body) => ({
        duration: tickRangeAt(body, 'duration', [4.5, 4.5]),
        interval: tickRangeAt(body, 'interval', [10, 20]),
        filters: filterAt(body, 'filters')
    })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => support.matches(params.filters),
            duration: params.duration,
            cooldown: params.interval,
            probability: 1
        })
});

/** What `minecraft:behavior.sniff` declares. */
export interface SniffParams {
    /** How long one sniff lasts, in ticks. */
    readonly duration: number;
    /** How long between sniffs, in ticks. */
    readonly cooldown: Range;
    /** How far the sniff reaches, in blocks. */
    readonly sniffingRadius: number;
    /** How far the entity remembers what it smelled, in blocks. */
    readonly suspicionRadiusHorizontal: number;
    readonly suspicionRadiusVertical: number;
}

/**
 * `minecraft:behavior.sniff`, which the warden carries. The sniff is what
 * turns a vibration into a suspicion the warden then investigates.
 */
export const sniff = goal<SniffParams>({
    name: 'minecraft:behavior.sniff',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 4.2),
        cooldown: tickRangeAt(body, 'cooldown_range', [5, 10]),
        sniffingRadius: numberAt(body, 'sniffing_radius', 24),
        suspicionRadiusHorizontal: numberAt(body, 'suspicion_radius_horizontal', 6),
        suspicionRadiusVertical: numberAt(body, 'suspicion_radius_vertical', 20)
    })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => support.mobs(params.sniffingRadius).length > 0,
            duration: [params.duration, params.duration],
            cooldown: params.cooldown,
            probability: 1
        })
});

/** What `minecraft:behavior.dig` declares. */
export interface DigParams {
    /** How long the dig takes, in ticks. */
    readonly duration: number;
    /** How long the entity stands still first, in ticks. */
    readonly idleTime: number;
    /** Whether a suspicion interrupts the dig. */
    readonly suspicionIsDisturbance: boolean;
    /** Whether a vibration interrupts it. */
    readonly vibrationIsDisturbance: boolean;
    readonly onStart: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.dig`, which the warden carries. It is how the warden
 * leaves when nothing has disturbed it for long enough.
 */
export const dig = goal<DigParams>({
    name: 'minecraft:behavior.dig',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 3.3),
        idleTime: ticksAt(body, 'idle_time', 0),
        suspicionIsDisturbance: booleanAt(body, 'suspicion_is_disturbance', false),
        vibrationIsDisturbance: booleanAt(body, 'vibration_is_disturbance', false),
        onStart: eventAt(body, 'on_start')
    })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => support.target() === undefined,
            duration: [params.duration, params.duration],
            cooldown: [0, 0],
            probability: 1,
            onStart: () => support.fire(params.onStart)
        })
});

/** What `minecraft:behavior.roll` declares. */
export interface RollParams {
    /** The chance per tick of rolling, in [0, 1]. */
    readonly probability: number;
}

/**
 * `minecraft:behavior.roll`, which the armadillo carries. The entity rolls
 * into a ball, which is a short animation rather than a move.
 */
export const roll = goal<RollParams>({
    name: 'minecraft:behavior.roll',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ probability: numberAt(body, 'probability', 0.0016) })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => true,
            duration: [20, 20],
            cooldown: [0, 0],
            probability: params.probability
        })
});

/** What `minecraft:behavior.play_dead` declares. */
export interface PlayDeadParams {
    /** How long the entity stays down, in ticks. */
    readonly duration: number;
    /** The chance per damage event of playing dead, in [0, 1]. */
    readonly randomStartChance: number;
    /** The health below which it plays dead. */
    readonly forceBelowHealth: number;
    /** Whether it regenerates while down. */
    readonly applyRegeneration: boolean;
    /** The damage causes that start it. */
    readonly damageSources: readonly string[];
    /** The damage it still takes while down. */
    readonly randomDamageRange: Range;
    readonly filters: Filter | undefined;
}

/**
 * `minecraft:behavior.play_dead`, which the axolotl carries. A hurt axolotl
 * drops to the bottom, regenerates and is ignored while it is down.
 */
export const playDead = goal<PlayDeadParams>({
    name: 'minecraft:behavior.play_dead',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 10),
        randomStartChance: numberAt(body, 'random_start_chance', 0.33),
        forceBelowHealth: numberAt(body, 'force_below_health', 0),
        applyRegeneration: booleanAt(body, 'apply_regeneration', false),
        damageSources: stringsAt(body, 'damage_sources'),
        randomDamageRange: tickRangeAt(body, 'random_damage_range', [0, 0]),
        filters: filterAt(body, 'filters')
    })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => {
                const health = support.measure('actor_health');
                if (health !== undefined && params.forceBelowHealth > 0 && health <= params.forceBelowHealth)
                    return true;
                const last = support.world.damagers?.().at(-1);
                if (last === undefined) return false;
                if (params.damageSources.length > 0 && !params.damageSources.includes(last.cause)) return false;
                return support.matches(params.filters);
            },
            duration: [params.duration, params.duration],
            cooldown: [0, 0],
            probability: params.randomStartChance
        })
});

/** What `minecraft:behavior.sneeze` declares. */
export interface SneezeParams {
    /** The entities the sneeze scares. */
    readonly entityTypes: readonly TargetEntityType[];
    /** How long before the next sneeze, in ticks. */
    readonly cooldown: number;
    /** How long the wind-up lasts, in ticks. */
    readonly prepareTime: number;
    /** The chance per tick of sneezing, in [0, 1]. */
    readonly probability: number;
    /** How far the sneeze startles others, in blocks. */
    readonly withinRadius: number;
    /** The chance of dropping an item, in [0, 1]. */
    readonly dropItemChance: number;
    /** The table the dropped item is rolled from. */
    readonly lootTable: string | undefined;
    readonly prepareSound: string | undefined;
    readonly sound: string | undefined;
}

/**
 * `minecraft:behavior.sneeze`, which the baby panda carries. The sneeze
 * scatters the mobs around it and sometimes drops slime.
 */
export const sneeze = goal<SneezeParams>({
    name: 'minecraft:behavior.sneeze',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        cooldown: ticksAt(body, 'cooldown_time', 1),
        prepareTime: ticksAt(body, 'prepare_time', 1),
        probability: numberAt(body, 'probability', 0.0002),
        withinRadius: numberAt(body, 'within_radius', 10),
        dropItemChance: numberAt(body, 'drop_item_chance', 0.001),
        lootTable: stringAt(body, 'loot_table'),
        prepareSound: stringAt(body, 'prepare_sound'),
        sound: stringAt(body, 'sound')
    })),
    create: (params, support) =>
        holdStill(support, {
            ready: () => true,
            duration: [params.prepareTime, params.prepareTime],
            cooldown: [params.cooldown, params.cooldown],
            probability: params.probability,
            onStart: () => support.playSound(params.prepareSound),
            onEnd: () => {
                support.playSound(params.sound);
                for (const mob of support.mobs(params.withinRadius)) {
                    if (!support.accepts(params.entityTypes, mob)) continue;
                    support.world.knockback?.(mob, 1, 0);
                }
                if (params.lootTable !== undefined && support.chance(params.dropItemChance))
                    support.world.dropLoot?.(params.lootTable, support.position());
            }
        })
});

/** What `minecraft:behavior.random_breach` declares. */
export interface RandomBreachParams {
    /** One tick in this many breaches. */
    readonly interval: number;
    /** How long before the entity breaches again, in ticks. */
    readonly cooldown: number;
    /** How far from the entity the breach aims, in blocks. */
    readonly xzDistance: number;
}

/**
 * `minecraft:behavior.random_breach`, which the dolphin carries. The entity
 * jumps clear of the water, which is why it aims above the surface.
 */
export const randomBreach = goal<RandomBreachParams>({
    name: 'minecraft:behavior.random_breach',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        interval: numberAt(body, 'interval', 120),
        cooldown: ticksAt(body, 'cooldown_time', 2),
        xzDistance: numberAt(body, 'xz_dist', 10)
    })),
    create: (params, support) => {
        let cooldown = 0;
        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (!support.flag('in_water')) return false;
                return params.interval <= 0 || support.chance(1 / params.interval);
            },
            canContinue: () => support.navigator.walking,
            start: () => {
                const here = support.position();
                const angle = support.random() * Math.PI * 2;
                support.navigator.moveTo(
                    {
                        x: here.x + Math.cos(angle) * params.xzDistance,
                        y: here.y + 3,
                        z: here.z + Math.sin(angle) * params.xzDistance
                    },
                    1,
                    1
                );
            },
            tick: () => {
                support.navigator.tick();
            },
            stop: () => {
                cooldown = params.cooldown;
                support.navigator.stop();
            }
        };
    }
});

/** Every goal in the environment family. */
export const environmentGoals: readonly RegisterableGoal[] = [
    sleep,
    nap,
    hide,
    layDown,
    randomSitting,
    ocelotSitOnBlock,
    eatBlock,
    eatCarriedItem,
    drinkMilk,
    snacking,
    croak,
    sniff,
    dig,
    roll,
    playDead,
    sneeze,
    randomBreach
];
