/**
 * The villager's brain. Transcribed from `VillagerGoalPackages` and `Villager` in the 26.3 server
 * jar.
 *
 * The villager is the only brain mob with a schedule. In 26.1 Mojang moved the schedule out of
 * code and into the `minecraft:timeline` datapack type, so the keyframes below are read from
 * `data/minecraft/timeline/villager_schedule.json` rather than from a Java class;
 * `Villager.registerBrainGoals` picks between the two tracks on `isBaby`.
 *
 * Nine activities, the most of any mob, and three of them (`panic`, `pre_raid`, `raid`, `hide`)
 * are driven by the raid system rather than by the schedule.
 */

import { Activities } from '../activity.js';
import type { ActivityData, PrioritizedBehavior, Schedule } from '../brain.js';
import { activityData, Brain } from '../brain.js';
import { behavior } from '../behavior/builder.js';
import {
    goToWantedItem,
    interactWith,
    interactWithDoor,
    lookAtTargetSink,
    moveToTargetSink,
    ofType,
    randomStroll,
    setEntityLookTarget,
    setLookAndInteract,
    setWalkTargetAwayFrom,
    setWalkTargetFromLookTarget,
    strollAroundPoi,
    strollToPoi,
    swim,
    timedState,
    updateActivityFromSchedule
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { DoNothing } from '../behavior/control.js';
import { GateBehavior, RunOne, triggerOneShuffled } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition, BrainMobOptions } from '../registry.js';
import {
    GolemSensor,
    HurtBySensor,
    NearestBedSensor,
    NearestItemSensor,
    NearestLivingEntitySensor,
    PlayerSensor,
    SecondaryPoiSensor,
    VillagerBabiesSensor,
    VillagerHostilesSensor
} from '../sensing/sensors.js';
import type { BrainContext } from '../world.js';
import { blockContaining, blockPosTracker, bottomCenterOf, distanceSquared } from '../world.js';

/** The named constants of `VillagerGoalPackages`. */
export const VILLAGER = {
    strollSpeedModifier: 0.4,
    interactDistSqr: 5,
    interactWalkupDist: 2,
    interactSpeedModifier: 0.5,
    /** Every package is built with `0.5F`, the villager's base speed modifier. */
    baseSpeedModifier: 0.5,
    /** The panic package multiplies the base speed by 1.5. */
    panicSpeedMultiplier: 1.5,
    /** `new ShowTradesToPlayer(400, 1600)`. */
    showTradesDuration: { min: 400, max: 1600 },
    /** `new GiveGiftToHero(100)`. */
    giveGiftDuration: 100,
    /** `SetHiddenState.create(15, 3)`: fifteen seconds hidden, three blocks close enough. */
    hiddenState: { seconds: 15, closeEnough: 3 },
    hideSearchDistance: 32,
    raidHideSearchDistance: 24,
    /** `AcquirePoi.create(..., Optional.of((byte)14))`: the home and meeting acquisition range. */
    poiAcquireRange: 14,
    jobSiteWalkRange: 9,
    homeWalkRange: 1,
    meetingWalkRange: 6
} as const;

/**
 * The villager schedule, read from `data/minecraft/timeline/villager_schedule.json` in the 26.3
 * vanilla datapack.
 *
 * An adult works from 2000 to 9000, meets from 9000 to 11000, idles until 12000 and rests after.
 * The first keyframe is at tick 10, not 0, so the very start of the day is the previous day's
 * last activity.
 */
export const VILLAGER_SCHEDULE: Schedule = {
    periodTicks: 24000,
    keyframes: [
        [10, Activities.IDLE],
        [2000, Activities.WORK],
        [9000, Activities.MEET],
        [11000, Activities.IDLE],
        [12000, Activities.REST]
    ]
};

/** The baby track of the same timeline: play instead of work and meet. */
export const BABY_VILLAGER_SCHEDULE: Schedule = {
    periodTicks: 24000,
    keyframes: [
        [10, Activities.IDLE],
        [3000, Activities.PLAY],
        [6000, Activities.IDLE],
        [10000, Activities.PLAY],
        [12000, Activities.REST]
    ]
};

/** What the brain needs to know about a villager profession. */
export interface VillagerProfession {
    /** The profession id, such as `minecraft:farmer`. */
    readonly id: string;
    /** The point-of-interest type the profession works at, such as `minecraft:farmer`. */
    readonly jobSitePoi: string;
    /** The blocks `SecondaryPoiSensor` looks for, such as farmland for the farmer. */
    readonly secondaryPoiBlocks: ReadonlySet<string>;
}

/** Java's `VillagerProfession.NONE`, the profession an unemployed villager carries. */
export const NO_PROFESSION: VillagerProfession = {
    id: 'minecraft:none',
    jobSitePoi: 'minecraft:none',
    secondaryPoiBlocks: new Set()
};

/** Java's `VillagerGoalPackages.getFullLookBehavior`, at priority 5. */
function fullLookBehavior(): PrioritizedBehavior {
    return [
        5,
        new RunOne([
            [setEntityLookTarget(ofType('minecraft:cat'), 8), 8],
            [setEntityLookTarget(ofType('minecraft:villager'), 8), 2],
            [setEntityLookTarget(ofType('minecraft:player'), 8), 2],
            [setEntityLookTarget((entity) => entity.typeTags.has('minecraft:creature'), 8), 1],
            [setEntityLookTarget((entity) => entity.typeTags.has('minecraft:water_creature'), 8), 1],
            [setEntityLookTarget((entity) => entity.typeTags.has('minecraft:axolotls'), 8), 1],
            [setEntityLookTarget((entity) => entity.typeTags.has('minecraft:underground_water_creature'), 8), 1],
            [setEntityLookTarget((entity) => entity.typeTags.has('minecraft:water_ambient'), 8), 1],
            [setEntityLookTarget((entity) => entity.typeTags.has('minecraft:monster'), 8), 1],
            [new DoNothing(30, 60), 2]
        ])
    ];
}

/** Java's `VillagerGoalPackages.getMinimalLookBehavior`, at priority 5. */
function minimalLookBehavior(): PrioritizedBehavior {
    return [
        5,
        new RunOne([
            [setEntityLookTarget(ofType('minecraft:villager'), 8), 2],
            [setEntityLookTarget(ofType('minecraft:player'), 8), 2],
            [new DoNothing(30, 60), 8]
        ])
    ];
}

/**
 * Java's `AcquirePoi`: claims a point of interest and writes it into a memory.
 *
 * It is the behavior that makes a villager take a job or a bed, and it is also the one that makes
 * two villagers compete: the ticket is taken through {@link BrainWorld.claimPoi}, and the second
 * villager to reach the bed gets nothing.
 */
function acquirePoi(
    poiType: string,
    memory: typeof MemoryModuleTypes.HOME,
    range: number,
    potentialMemory?: typeof MemoryModuleTypes.POTENTIAL_JOB_SITE
): BehaviorControl {
    return behavior('AcquirePoi')
        .absent(memory)
        .build((context) => {
            const found = context.world.pointsOfInterest(
                blockContaining(context.body.position),
                range,
                (type) => type === poiType
            );
            const free = found.find((poi) => poi.hasSpace);
            if (free === undefined) {
                return false;
            }
            if (!context.world.claimPoi(free.pos, context.body)) {
                return false;
            }
            context.body.brain.setMemory(memory, { dimension: context.world.dimension, pos: free.pos });
            if (potentialMemory !== undefined) {
                context.body.brain.eraseMemory(potentialMemory);
            }
            return true;
        });
}

/** Java's `ValidateNearbyPoi`: forgets a point of interest whose block is no longer the right one. */
function validateNearbyPoi(poiType: string, memory: typeof MemoryModuleTypes.HOME): BehaviorControl {
    return behavior('ValidateNearbyPoi')
        .present(memory)
        .build((context, slot) => {
            const poi = slot.get();
            if (poi.dimension !== context.world.dimension) {
                slot.erase();
                return true;
            }
            const stillThere = context.world
                .pointsOfInterest(poi.pos, 1, (type) => type === poiType)
                .some((found) => found.pos.x === poi.pos.x && found.pos.y === poi.pos.y && found.pos.z === poi.pos.z);
            if (!stillThere) {
                context.world.releasePoi(poi.pos, context.body);
                slot.erase();
            }
            return true;
        });
}

/** Java's `SetWalkTargetFromBlockMemory`: walks towards a remembered block, now and then. */
function setWalkTargetFromBlockMemory(
    memory: typeof MemoryModuleTypes.HOME,
    speedModifier: number,
    closeEnough: number,
    maxDistFromPoi: number,
    maxDistToPoi: number
): BehaviorControl {
    let nextOkStartTime = 0;
    return behavior('SetWalkTargetFromBlockMemory')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .present(memory)
        .build((context, walkTarget, poi) => {
            const target = poi.get();
            if (target.dimension !== context.world.dimension) {
                return false;
            }
            const distanceSqr = distanceSquared(bottomCenterOf(target.pos), context.body.position);
            if (distanceSqr > maxDistToPoi ** 2) {
                return false;
            }
            if (distanceSqr <= maxDistFromPoi ** 2) {
                return false;
            }
            const timestamp = context.world.gameTime();
            if (timestamp <= nextOkStartTime) {
                return true;
            }
            walkTarget.set({ target: blockPosTracker(target.pos), speedModifier, closeEnoughDist: closeEnough });
            nextOkStartTime = timestamp + 100;
            return true;
        });
}

/** Java's `WorkAtPoi`: the behavior that makes a villager actually restock, at the job site. */
function workAtPoi(): BehaviorControl {
    return behavior('WorkAtPoi')
        .present(MemoryModuleTypes.JOB_SITE)
        .registered(MemoryModuleTypes.LAST_WORKED_AT_POI)
        .build((context, jobSite, lastWorked) => {
            const site = jobSite.get();
            if (
                site.dimension !== context.world.dimension ||
                distanceSquared(bottomCenterOf(site.pos), context.body.position) > 1.75 * 1.75
            ) {
                return false;
            }
            lastWorked.set(context.world.gameTime());
            context.world.emitGameEvent('minecraft:block_change', bottomCenterOf(site.pos), context.body);
            return true;
        });
}

/** Java's `VillagerPanicTrigger`: a hostile or an attacker forces the `panic` activity. */
function villagerPanicTrigger(): BehaviorControl {
    return behavior('VillagerPanicTrigger').build((context) => {
        const brain = context.body.brain;
        const threatened =
            brain.hasMemoryValue(MemoryModuleTypes.NEAREST_HOSTILE) ||
            brain.hasMemoryValue(MemoryModuleTypes.HURT_BY_ENTITY);
        if (!threatened) {
            return false;
        }
        if (brain.getActiveNonCoreActivity() !== Activities.PANIC) {
            brain.eraseMemory(MemoryModuleTypes.PATH);
            brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            brain.eraseMemory(MemoryModuleTypes.LOOK_TARGET);
            brain.eraseMemory(MemoryModuleTypes.BREED_TARGET);
            brain.eraseMemory(MemoryModuleTypes.INTERACTION_TARGET);
        }
        brain.setActiveActivityIfPossible(Activities.PANIC);
        return true;
    });
}

/** Java's `VillagerCalmDown`: leaves `panic` once nothing is threatening the villager. */
function villagerCalmDown(): BehaviorControl {
    return behavior('VillagerCalmDown').build((context) => {
        const brain = context.body.brain;
        const threatened =
            brain.hasMemoryValue(MemoryModuleTypes.NEAREST_HOSTILE) ||
            brain.hasMemoryValue(MemoryModuleTypes.HURT_BY_ENTITY);
        if (threatened) {
            return false;
        }
        brain.eraseMemory(MemoryModuleTypes.HURT_BY);
        brain.updateActivityFromSchedule(context.world.gameTime(), context.world.dayTime());
        return true;
    });
}

/** Java's `ReactToBell`: a rung bell sends everyone to `hide`. */
function reactToBell(): BehaviorControl {
    return behavior('ReactToBell')
        .present(MemoryModuleTypes.HEARD_BELL_TIME)
        .build((context) => {
            context.body.brain.setActiveActivityIfPossible(Activities.HIDE);
            return true;
        });
}

/**
 * Java's `SetHiddenState.create(15, 3)`: counts the hide down, then goes back to the schedule.
 *
 * The second Java argument, the three-block close-enough distance, belongs to
 * {@link locateHidingPlace} rather than to the countdown, so it does not appear here.
 */
function setHiddenState(seconds: number): BehaviorControl {
    return timedState('SetHiddenState', seconds * 20, {
        eraseOnStop: [MemoryModuleTypes.HEARD_BELL_TIME, MemoryModuleTypes.HIDING_PLACE],
        onStop: (context) =>
            context.body.brain.updateActivityFromSchedule(context.world.gameTime(), context.world.dayTime())
    });
}

/** Java's `LocateHidingPlace`: finds a `minecraft:home` point of interest and runs for it. */
function locateHidingPlace(radius: number, speedModifier: number, closeEnough: number): BehaviorControl {
    return behavior('LocateHidingPlace')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .registered(MemoryModuleTypes.HIDING_PLACE)
        .build((context, walkTarget, hidingPlace) => {
            const home = context.world.pointsOfInterest(
                blockContaining(context.body.position),
                radius,
                (type) => type === 'minecraft:home'
            )[0];
            if (home === undefined) {
                return false;
            }
            hidingPlace.set({ dimension: context.world.dimension, pos: home.pos });
            walkTarget.set({ target: blockPosTracker(home.pos), speedModifier, closeEnoughDist: closeEnough });
            return true;
        });
}

/** Java's `SleepInBed`: occupies the bed the villager claimed. */
function sleepInBed(): BehaviorControl {
    return behavior('SleepInBed')
        .present(MemoryModuleTypes.HOME)
        .registered(MemoryModuleTypes.LAST_SLEPT)
        .registered(MemoryModuleTypes.LAST_WOKEN)
        .build((context, home, lastSlept) => {
            const bed = home.get();
            if (distanceSquared(bottomCenterOf(bed.pos), context.body.position) > 4) {
                return false;
            }
            lastSlept.set(context.world.gameTime());
            return true;
        });
}

/** Java's `WakeUp`: clears the sleep memory when the schedule leaves `rest`. */
function wakeUp(): BehaviorControl {
    return behavior('WakeUp')
        .registered(MemoryModuleTypes.LAST_WOKEN)
        .build((context, lastWoken) => {
            if (context.body.brain.isActive(Activities.REST)) {
                return false;
            }
            lastWoken.set(context.world.gameTime());
            return true;
        });
}

/** Java's `getCorePackage`, the one package every villager always runs. */
export function corePackage(profession: VillagerProfession, speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [0, swim(0.8)],
        [0, interactWithDoor()],
        [0, lookAtTargetSink(45, 90)],
        [0, villagerPanicTrigger()],
        [0, wakeUp()],
        [0, reactToBell()],
        [0, timedState('SetRaidStatus', 1)],
        [0, validateNearbyPoi(profession.jobSitePoi, MemoryModuleTypes.JOB_SITE)],
        [0, validateNearbyPoi(profession.jobSitePoi, MemoryModuleTypes.POTENTIAL_JOB_SITE)],
        [1, moveToTargetSink()],
        [2, timedState('PoiCompetitorScan', 1)],
        [3, timedState('LookAndFollowTradingPlayerSink', 1)],
        [5, goToWantedItem(speedModifier, false, 4)],
        [
            6,
            acquirePoi(
                profession.jobSitePoi,
                MemoryModuleTypes.JOB_SITE,
                VILLAGER.poiAcquireRange,
                MemoryModuleTypes.POTENTIAL_JOB_SITE
            )
        ],
        [7, timedState('GoToPotentialJobSite', 1)],
        [8, timedState('YieldJobSite', 1)],
        [10, acquirePoi('minecraft:home', MemoryModuleTypes.HOME, VILLAGER.poiAcquireRange)],
        [10, acquirePoi('minecraft:meeting', MemoryModuleTypes.MEETING_POINT, VILLAGER.poiAcquireRange)],
        [10, timedState('AssignProfessionFromJobSite', 1)],
        [10, timedState('ResetProfession', 1)]
    ];
}

/** Java's `getWorkPackage`. The farmer's two farming weights differ from everyone else's. */
export function workPackage(profession: VillagerProfession, speedModifier: number): readonly PrioritizedBehavior[] {
    const isFarmer = profession.id === 'minecraft:farmer';
    return [
        minimalLookBehavior(),
        [
            5,
            new RunOne([
                [workAtPoi(), 7],
                [strollAroundPoi(MemoryModuleTypes.JOB_SITE, VILLAGER.strollSpeedModifier, 4), 2],
                [strollToPoi(MemoryModuleTypes.JOB_SITE, VILLAGER.strollSpeedModifier, 1, 10), 5],
                [timedState('StrollToPoiList', 1), 5],
                [timedState('HarvestFarmland', 1), isFarmer ? 2 : 5],
                [timedState('UseBonemeal', 1), isFarmer ? 4 : 7]
            ])
        ],
        [10, timedState('ShowTradesToPlayer', VILLAGER.showTradesDuration.min)],
        [10, setLookAndInteract('minecraft:player', 4)],
        [
            2,
            setWalkTargetFromBlockMemory(
                MemoryModuleTypes.JOB_SITE,
                speedModifier,
                VILLAGER.jobSiteWalkRange,
                100,
                1200
            )
        ],
        [3, timedState('GiveGiftToHero', VILLAGER.giveGiftDuration)],
        [99, updateActivityFromSchedule()]
    ];
}

/** Java's `getPlayPackage`, the baby villager's whole day. */
export function playPackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [0, moveToTargetSink({ minDuration: 80, maxDuration: 120 })],
        fullLookBehavior(),
        [5, timedState('PlayTagWithOtherKids', 1)],
        [
            5,
            new RunOne(
                [
                    [interactWith('minecraft:villager', 8, MemoryModuleTypes.INTERACTION_TARGET, speedModifier, 2), 2],
                    [interactWith('minecraft:cat', 8, MemoryModuleTypes.INTERACTION_TARGET, speedModifier, 2), 1],
                    [randomStroll(speedModifier), 1],
                    [setWalkTargetFromLookTarget(speedModifier, 2), 1],
                    [timedState('JumpOnBed', 1), 2],
                    [new DoNothing(20, 40), 2]
                ],
                new Map([[MemoryModuleTypes.VISIBLE_VILLAGER_BABIES, 'value_absent']])
            )
        ],
        [99, updateActivityFromSchedule()]
    ];
}

/** Java's `getRestPackage`. */
export function restPackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [2, setWalkTargetFromBlockMemory(MemoryModuleTypes.HOME, speedModifier, VILLAGER.homeWalkRange, 150, 1200)],
        [3, validateNearbyPoi('minecraft:home', MemoryModuleTypes.HOME)],
        [3, sleepInBed()],
        [
            5,
            new RunOne(
                [
                    [timedState('SetClosestHomeAsWalkTarget', 1), 1],
                    [randomStroll(speedModifier), 4],
                    [timedState('GoToClosestVillage', 1), 2],
                    [new DoNothing(20, 40), 2]
                ],
                new Map([[MemoryModuleTypes.HOME, 'value_absent']])
            )
        ],
        minimalLookBehavior(),
        [99, updateActivityFromSchedule()]
    ];
}

/** Java's `getMeetPackage`. */
export function meetPackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [
            2,
            triggerOneShuffled([
                [
                    (context, timestamp) =>
                        strollAroundPoi(MemoryModuleTypes.MEETING_POINT, VILLAGER.strollSpeedModifier, 40).trigger(
                            context,
                            timestamp
                        ),
                    2
                ],
                [(context, timestamp) => timedState('SocializeAtBell', 1).tryStart(context, timestamp), 2]
            ])
        ],
        [10, timedState('ShowTradesToPlayer', VILLAGER.showTradesDuration.min)],
        [10, setLookAndInteract('minecraft:player', 4)],
        [
            2,
            setWalkTargetFromBlockMemory(
                MemoryModuleTypes.MEETING_POINT,
                speedModifier,
                VILLAGER.meetingWalkRange,
                100,
                200
            )
        ],
        [3, timedState('GiveGiftToHero', VILLAGER.giveGiftDuration)],
        [3, validateNearbyPoi('minecraft:meeting', MemoryModuleTypes.MEETING_POINT)],
        [
            3,
            new GateBehavior('ordered', 'run_one', [[timedState('TradeWithVillager', 1), 1]], {
                exitErasedMemories: [MemoryModuleTypes.INTERACTION_TARGET]
            })
        ],
        fullLookBehavior(),
        [99, updateActivityFromSchedule()]
    ];
}

/** Java's `getIdlePackage`. */
export function idlePackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [
            2,
            new RunOne([
                [interactWith('minecraft:villager', 8, MemoryModuleTypes.INTERACTION_TARGET, speedModifier, 2), 2],
                [interactWith('minecraft:villager', 8, MemoryModuleTypes.BREED_TARGET, speedModifier, 2), 1],
                [interactWith('minecraft:cat', 8, MemoryModuleTypes.INTERACTION_TARGET, speedModifier, 2), 1],
                [randomStroll(speedModifier), 1],
                [setWalkTargetFromLookTarget(speedModifier, 2), 1],
                [timedState('JumpOnBed', 1), 1],
                [new DoNothing(30, 60), 1]
            ])
        ],
        [3, timedState('GiveGiftToHero', VILLAGER.giveGiftDuration)],
        [3, setLookAndInteract('minecraft:player', 4)],
        [3, timedState('ShowTradesToPlayer', VILLAGER.showTradesDuration.min)],
        [
            3,
            new GateBehavior('ordered', 'run_one', [[timedState('TradeWithVillager', 1), 1]], {
                exitErasedMemories: [MemoryModuleTypes.INTERACTION_TARGET]
            })
        ],
        [
            3,
            new GateBehavior('ordered', 'run_one', [[timedState('VillagerMakeLove', 1), 1]], {
                exitErasedMemories: [MemoryModuleTypes.BREED_TARGET]
            })
        ],
        fullLookBehavior(),
        [99, updateActivityFromSchedule()]
    ];
}

/** Java's `getPanicPackage`: the runaway speed is the base speed times 1.5. */
export function panicPackage(speedModifier: number): readonly PrioritizedBehavior[] {
    const runawaySpeed = speedModifier * VILLAGER.panicSpeedMultiplier;
    return [
        [0, villagerCalmDown()],
        [
            1,
            setWalkTargetAwayFrom(
                MemoryModuleTypes.NEAREST_HOSTILE,
                (entity) => entity.position,
                runawaySpeed,
                6,
                false
            )
        ],
        [
            1,
            setWalkTargetAwayFrom(MemoryModuleTypes.HURT_BY_ENTITY, (entity) => entity.position, runawaySpeed, 6, false)
        ],
        [3, randomStroll(runawaySpeed, 'land', { xzRange: 2, yRange: 2 })],
        minimalLookBehavior()
    ];
}

/** Java's `getPreRaidPackage`. */
export function preRaidPackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [0, timedState('RingBell', 1)],
        [
            0,
            triggerOneShuffled([
                [
                    (context, timestamp) =>
                        setWalkTargetFromBlockMemory(
                            MemoryModuleTypes.MEETING_POINT,
                            speedModifier * 1.5,
                            2,
                            150,
                            200
                        ).tryStart(context, timestamp),
                    6
                ],
                [(context, timestamp) => randomStroll(speedModifier * 1.5).trigger(context, timestamp), 2]
            ])
        ],
        minimalLookBehavior(),
        [99, timedState('ResetRaidStatus', 1)]
    ];
}

/** Java's `getRaidPackage`. */
export function raidPackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [0, timedState('MoveToSkySeeingSpot', 1)],
        [0, timedState('CelebrateVillagersSurvivedRaid', 600)],
        [2, locateHidingPlace(VILLAGER.raidHideSearchDistance, speedModifier * 1.4, 1)],
        minimalLookBehavior(),
        [99, timedState('ResetRaidStatus', 1)]
    ];
}

/** Java's `getHidePackage`. */
export function hidePackage(speedModifier: number): readonly PrioritizedBehavior[] {
    return [
        [0, setHiddenState(VILLAGER.hiddenState.seconds)],
        [1, locateHidingPlace(VILLAGER.hideSearchDistance, speedModifier * 1.25, 2)],
        minimalLookBehavior()
    ];
}

/**
 * Java's `Villager.BRAIN_PROVIDER` activity supplier.
 *
 * `work` needs a job site and `meet` needs a meeting point, which is what keeps the schedule from
 * sending an unemployed villager to a workplace it does not have; both fall back to `idle` through
 * `setActiveActivityIfPossible`.
 */
export function villagerActivities(profession: VillagerProfession, baby: boolean): readonly ActivityData[] {
    const speed = VILLAGER.baseSpeedModifier;
    const activities: ActivityData[] = [];
    if (baby) {
        activities.push(activityData(Activities.PLAY, playPackage(speed)));
    } else {
        activities.push(
            activityData(Activities.WORK, workPackage(profession, speed), {
                conditions: [[MemoryModuleTypes.JOB_SITE, 'value_present']]
            })
        );
    }
    activities.push(activityData(Activities.CORE, corePackage(profession, speed)));
    activities.push(
        activityData(Activities.MEET, meetPackage(speed), {
            conditions: [[MemoryModuleTypes.MEETING_POINT, 'value_present']]
        })
    );
    activities.push(activityData(Activities.REST, restPackage(speed)));
    activities.push(activityData(Activities.IDLE, idlePackage(speed)));
    activities.push(activityData(Activities.PANIC, panicPackage(speed)));
    activities.push(activityData(Activities.PRE_RAID, preRaidPackage(speed)));
    activities.push(activityData(Activities.RAID, raidPackage(speed)));
    activities.push(activityData(Activities.HIDE, hidePackage(speed)));
    return activities;
}

/** Builds a villager brain for a profession and an age. */
export function makeVillagerBrain(profession: VillagerProfession, baby: boolean): Brain {
    return new Brain({
        sensors: [
            new NearestLivingEntitySensor(),
            new PlayerSensor(),
            new NearestItemSensor(),
            new NearestBedSensor(),
            new HurtBySensor(),
            new VillagerHostilesSensor(),
            new VillagerBabiesSensor(),
            new SecondaryPoiSensor(profession.secondaryPoiBlocks),
            new GolemSensor()
        ],
        activities: villagerActivities(profession, baby),
        schedule: baby ? BABY_VILLAGER_SCHEDULE : VILLAGER_SCHEDULE
    });
}

/**
 * The villager's registry entry. `makeBrain` reads the profession and the baby flag off the
 * options, and `updateActivity` goes through the schedule rather than a priority list.
 */
export const VILLAGER_BRAIN: BrainMobDefinition = {
    id: 'minecraft:villager',
    memories: [],
    sensorTypes: [
        'nearest_living_entities',
        'nearest_players',
        'nearest_items',
        'nearest_bed',
        'hurt_by',
        'villager_hostiles',
        'villager_babies',
        'secondary_pois',
        'golem_detected'
    ],
    alsoRunsGoals: false,
    makeBrain: (options?: BrainMobOptions) =>
        makeVillagerBrain(
            options?.variant === undefined
                ? NO_PROFESSION
                : { id: options.variant, jobSitePoi: options.variant, secondaryPoiBlocks: new Set() },
            options?.baby ?? false
        ),
    /**
     * The villager is the one mob whose activity comes from its schedule rather than from a
     * priority list, which is why this reads the time of day instead of calling
     * `setActiveActivityToFirstValid`.
     */
    updateActivity: (context: BrainContext) =>
        context.body.brain.updateActivityFromSchedule(context.world.gameTime(), context.world.dayTime())
};
