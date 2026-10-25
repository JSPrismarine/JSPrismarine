/**
 * The brain: a memory map, a sensor list, and a table of behaviors keyed by priority and activity.
 *
 * Transcribed from `net.minecraft.world.entity.ai.Brain` in the pinned 26.3 server jar, including
 * the tick order, the empty-collection rule in `setMemory`, the core-activity set, and the
 * twenty-tick throttle on the schedule.
 */

import type { Activity } from './activity.js';
import { Activities } from './activity.js';
import type { BehaviorControl } from './behavior/control.js';
import type { MemoryModuleType, MemoryStatus } from './memory.js';
import { MemorySlot } from './memory.js';
import type { Sensor } from './sensing/sensor.js';
import type { BrainContext } from './world.js';

/** A memory condition on an activity: the activity may start only while it holds. */
export type ActivityCondition = readonly [MemoryModuleType<unknown>, MemoryStatus];

/** One behavior with the priority it holds inside its activity. */
export type PrioritizedBehavior = readonly [priority: number, behavior: BehaviorControl];

/**
 * One activity's entry in a mob's brain. Java's `ActivityData`.
 *
 * `conditions` gate whether {@link Brain.setActiveActivityIfPossible} will choose the activity. An
 * empty set passes, so a registered activity with no conditions is always available; it is an
 * activity the mob never registered at all that is refused.
 */
export interface ActivityData {
    readonly activity: Activity;
    readonly behaviors: readonly PrioritizedBehavior[];
    readonly conditions: readonly ActivityCondition[];
    /** Erased when the brain leaves the activity. Java's `memoriesToEraseWhenStopped`. */
    readonly memoriesToEraseWhenStopped: readonly MemoryModuleType<unknown>[];
}

/** Java's `ActivityData.createPriorityPairs`: numbers a behavior list from `first` upward. */
export function prioritized(first: number, behaviors: readonly BehaviorControl[]): readonly PrioritizedBehavior[] {
    return behaviors.map((behavior, index) => [first + index, behavior] as const);
}

/** Options for {@link activityData} beyond the behavior list. */
export interface ActivityDataOptions {
    readonly conditions?: readonly ActivityCondition[];
    readonly memoriesToEraseWhenStopped?: readonly MemoryModuleType<unknown>[];
    /**
     * The shorthand Java spells `ActivityData.create(activity, priority, list, memory)`: the memory
     * must be present for the activity to start and is erased when it stops.
     */
    readonly gatedBy?: MemoryModuleType<unknown>;
}

/** Builds an {@link ActivityData}, mirroring Java's seven `ActivityData.create` overloads. */
export function activityData(
    activity: Activity,
    behaviors: readonly PrioritizedBehavior[],
    options: ActivityDataOptions = {}
): ActivityData {
    const gated = options.gatedBy;
    return {
        activity,
        behaviors,
        conditions: gated === undefined ? (options.conditions ?? []) : [[gated, 'value_present']],
        memoriesToEraseWhenStopped: gated === undefined ? (options.memoriesToEraseWhenStopped ?? []) : [gated]
    };
}

/** Java's `Brain.SCHEDULE_UPDATE_DELAY`. */
const SCHEDULE_UPDATE_DELAY = 20;

/**
 * A timetable mapping the time of day to an activity, the shape Java moved into the
 * `minecraft:timeline` datapack type in 26.1.
 *
 * Keyframes are sorted by tick; the activity in force is the last keyframe at or before the current
 * day time, wrapping at `periodTicks`.
 */
export interface Schedule {
    readonly periodTicks: number;
    readonly keyframes: readonly (readonly [ticks: number, activity: Activity])[];
}

/** The activity a {@link Schedule} selects for a time of day. */
export function scheduledActivity(schedule: Schedule, dayTime: number): Activity {
    const time = ((dayTime % schedule.periodTicks) + schedule.periodTicks) % schedule.periodTicks;
    let selected = schedule.keyframes[schedule.keyframes.length - 1]?.[1] ?? Activities.IDLE;
    for (const [ticks, activity] of schedule.keyframes) {
        if (ticks <= time) {
            selected = activity;
        }
    }
    return selected;
}

/** How a brain is built: its extra memories, its sensors and its activity table. */
export interface BrainDefinition {
    /**
     * Memories the mob keeps that no sensor and no behavior declares. Java calls this overload of
     * `Brain.provider` deprecated but eight of the twenty mobs still use it.
     */
    readonly memories?: readonly MemoryModuleType<unknown>[];
    readonly sensors: readonly Sensor[];
    readonly activities: readonly ActivityData[];
    readonly schedule?: Schedule;
    /** Defaults to `core`, which is what every vanilla brain uses. */
    readonly coreActivities?: readonly Activity[];
    /** Defaults to `idle`, as Java's field initializer does. */
    readonly defaultActivity?: Activity;
}

export class Brain {
    private readonly memories = new Map<MemoryModuleType<unknown>, MemorySlot<unknown>>();
    private readonly sensors: readonly Sensor[];
    /** Priority to activity to behavior set, iterated in ascending priority order. */
    private readonly behaviorsByPriority = new Map<number, Map<Activity, Set<BehaviorControl>>>();
    private readonly activityRequirements = new Map<Activity, readonly ActivityCondition[]>();
    private readonly activityMemoriesToEraseWhenStopped = new Map<Activity, readonly MemoryModuleType<unknown>[]>();

    private coreActivities: readonly Activity[];
    private readonly activeActivities = new Set<Activity>();
    private defaultActivity: Activity;
    private schedule: Schedule | undefined;
    private lastScheduleUpdate = -9999;

    public constructor(definition: BrainDefinition) {
        this.sensors = definition.sensors;
        this.coreActivities = definition.coreActivities ?? [Activities.CORE];
        this.defaultActivity = definition.defaultActivity ?? Activities.IDLE;
        this.schedule = definition.schedule;

        for (const memory of definition.memories ?? []) {
            this.registerMemory(memory);
        }
        for (const sensor of this.sensors) {
            for (const memory of sensor.requires) {
                this.registerMemory(memory);
            }
        }
        for (const activity of definition.activities) {
            this.addActivity(activity);
        }
        this.useDefaultActivity();
    }

    /** Randomizes each sensor's first scan tick, as Java's `Sensor::randomlyDelayStart` does. */
    public delaySensorStarts(randomInt: (bound: number) => number): void {
        for (const sensor of this.sensors) {
            sensor.randomlyDelayStart(randomInt);
        }
    }

    private registerMemory(memory: MemoryModuleType<unknown>): void {
        if (!this.memories.has(memory)) {
            this.memories.set(memory, new MemorySlot());
        }
    }

    private addActivity(data: ActivityData): void {
        this.activityRequirements.set(data.activity, data.conditions);
        if (data.memoriesToEraseWhenStopped.length > 0) {
            this.activityMemoriesToEraseWhenStopped.set(data.activity, data.memoriesToEraseWhenStopped);
        }
        for (const [priority, behavior] of data.behaviors) {
            for (const memory of behavior.requiredMemories) {
                this.registerMemory(memory);
            }
            let byActivity = this.behaviorsByPriority.get(priority);
            if (byActivity === undefined) {
                byActivity = new Map();
                this.behaviorsByPriority.set(priority, byActivity);
            }
            let behaviors = byActivity.get(data.activity);
            if (behaviors === undefined) {
                behaviors = new Set();
                byActivity.set(data.activity, behaviors);
            }
            behaviors.add(behavior);
        }
    }

    /**
     * The one place this package casts. The memory map is heterogeneous: every slot holds the type
     * its key declares, but the map itself can only be typed at the widest value. The invariant is
     * enforced by construction, because {@link Brain.registerMemory} is the only writer of the map
     * and {@link Brain.setMemoryWithExpiry} is the only writer of a slot.
     */
    private slot<Value>(memory: MemoryModuleType<Value>): MemorySlot<Value> | undefined {
        return this.memories.get(memory) as MemorySlot<Value> | undefined;
    }

    /** Whether the memory is registered and currently holds a value. */
    public hasMemoryValue(memory: MemoryModuleType<unknown>): boolean {
        return this.checkMemory(memory, 'value_present');
    }

    /**
     * Java's `Brain.checkMemory`. An unregistered memory fails every status, including
     * `registered`, which is what makes a brain ignore a behavior whose memories it never declared.
     */
    public checkMemory(memory: MemoryModuleType<unknown>, status: MemoryStatus): boolean {
        const slot = this.slot(memory);
        if (slot === undefined) {
            return false;
        }
        switch (status) {
            case 'registered':
                return true;
            case 'value_present':
                return slot.hasValue();
            case 'value_absent':
                return !slot.hasValue();
        }
    }

    /** The memory's value, or `undefined` when empty or unregistered. */
    public getMemory<Value>(memory: MemoryModuleType<Value>): Value | undefined {
        return this.slot(memory)?.value();
    }

    /** Whether the memory holds exactly this value, Java's `Brain.isMemoryValue`. */
    public isMemoryValue<Value>(memory: MemoryModuleType<Value>, value: Value): boolean {
        return this.slot(memory)?.value() === value;
    }

    /** Ticks remaining before the memory expires, or {@link MemorySlot.NEVER_EXPIRE}. */
    public getTimeUntilExpiry(memory: MemoryModuleType<unknown>): number {
        return this.slot(memory)?.timeToLive() ?? MemorySlot.NEVER_EXPIRE;
    }

    /**
     * Writes a memory. `undefined` erases it, and so does an empty array: Java's
     * `isEmptyCollection` check means a sensor that finds nothing clears the memory rather than
     * storing an empty list, which is what lets `value_present` mean "found something".
     *
     * Writing an unregistered memory is silently dropped, as Java's null-slot check is.
     */
    public setMemory<Value>(memory: MemoryModuleType<Value>, value: Value | undefined): void {
        this.setMemoryWithExpiry(memory, value, MemorySlot.NEVER_EXPIRE);
    }

    /** Writes a memory that erases itself after `timeToLive` brain ticks. */
    public setMemoryWithExpiry<Value>(
        memory: MemoryModuleType<Value>,
        value: Value | undefined,
        timeToLive: number
    ): void {
        const slot = this.slot(memory);
        if (slot === undefined) {
            return;
        }
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
            slot.clear();
        } else {
            slot.set(value, timeToLive);
        }
    }

    public eraseMemory(memory: MemoryModuleType<unknown>): void {
        this.slot(memory)?.clear();
    }

    /** Empties every registered memory without unregistering any. */
    public clearMemories(): void {
        for (const slot of this.memories.values()) {
            slot.clear();
        }
    }

    /** Every registered memory module type. */
    public get registeredMemories(): readonly MemoryModuleType<unknown>[] {
        return [...this.memories.keys()];
    }

    public setSchedule(schedule: Schedule | undefined): void {
        this.schedule = schedule;
    }

    public setCoreActivities(activities: readonly Activity[]): void {
        this.coreActivities = activities;
    }

    public setDefaultActivity(activity: Activity): void {
        this.defaultActivity = activity;
    }

    public isActive(activity: Activity): boolean {
        return this.activeActivities.has(activity);
    }

    public getActiveActivities(): readonly Activity[] {
        return [...this.activeActivities];
    }

    /** The one non-core activity in force, which is what a mob's sound and pose logic reads. */
    public getActiveNonCoreActivity(): Activity | undefined {
        for (const activity of this.activeActivities) {
            if (!this.coreActivities.includes(activity)) {
                return activity;
            }
        }
        return undefined;
    }

    public getRunningBehaviors(): readonly BehaviorControl[] {
        const running: BehaviorControl[] = [];
        for (const priority of this.ascendingPriorities()) {
            for (const behaviors of this.behaviorsByPriority.get(priority)?.values() ?? []) {
                for (const behavior of behaviors) {
                    if (behavior.status === 'running') {
                        running.push(behavior);
                    }
                }
            }
        }
        return running;
    }

    public useDefaultActivity(): void {
        this.setActiveActivity(this.defaultActivity);
    }

    /** Switches to the activity when its memory conditions hold, and to the default when not. */
    public setActiveActivityIfPossible(activity: Activity): void {
        if (this.activityRequirementsAreMet(activity)) {
            this.setActiveActivity(activity);
        } else {
            this.useDefaultActivity();
        }
    }

    /**
     * Switches to the first activity in the list whose conditions hold, and leaves the current one
     * alone when none do. This is what every mob's `updateActivity` calls, and the list order is
     * the mob's priority order between activities.
     */
    public setActiveActivityToFirstValid(activities: readonly Activity[]): void {
        for (const activity of activities) {
            if (this.activityRequirementsAreMet(activity)) {
                this.setActiveActivity(activity);
                return;
            }
        }
    }

    private setActiveActivity(activity: Activity): void {
        if (this.isActive(activity)) {
            return;
        }
        this.eraseMemoriesForOtherActivitiesThan(activity);
        this.activeActivities.clear();
        for (const core of this.coreActivities) {
            this.activeActivities.add(core);
        }
        this.activeActivities.add(activity);
    }

    private eraseMemoriesForOtherActivitiesThan(activity: Activity): void {
        for (const old of this.activeActivities) {
            if (old === activity) {
                continue;
            }
            for (const memory of this.activityMemoriesToEraseWhenStopped.get(old) ?? []) {
                this.eraseMemory(memory);
            }
        }
    }

    private activityRequirementsAreMet(activity: Activity): boolean {
        const requirements = this.activityRequirements.get(activity);
        if (requirements === undefined) {
            return false;
        }
        return requirements.every(([memory, status]) => this.checkMemory(memory, status));
    }

    /**
     * Reads the schedule and switches activity, at most once every twenty ticks.
     *
     * The throttle is Java's and it is observable: a villager crossing a keyframe can take up to a
     * second to notice.
     */
    public updateActivityFromSchedule(gameTime: number, dayTime: number): void {
        if (gameTime - this.lastScheduleUpdate <= SCHEDULE_UPDATE_DELAY) {
            return;
        }
        this.lastScheduleUpdate = gameTime;
        const wanted = this.schedule === undefined ? Activities.IDLE : scheduledActivity(this.schedule, dayTime);
        if (!this.activeActivities.has(wanted)) {
            this.setActiveActivityIfPossible(wanted);
        }
    }

    /**
     * One brain tick, in Java's order: age the memories, run the sensors, start every stopped
     * behavior whose activity is active, then tick every running one.
     *
     * Starting before ticking is observable: a behavior started this tick also ticks this tick.
     */
    public tick(context: BrainContext): void {
        this.forgetOutdatedMemories();
        this.tickSensors(context);
        this.startEachNonRunningBehavior(context);
        this.tickEachRunningBehavior(context);
    }

    /** Stops every running behavior, as Java does when a villager's brain is rebuilt. */
    public stopAll(context: BrainContext): void {
        const timestamp = context.world.gameTime();
        for (const behavior of this.getRunningBehaviors()) {
            behavior.doStop(context, timestamp);
        }
    }

    private forgetOutdatedMemories(): void {
        for (const slot of this.memories.values()) {
            slot.tick();
        }
    }

    private tickSensors(context: BrainContext): void {
        for (const sensor of this.sensors) {
            sensor.tick(context);
        }
    }

    private ascendingPriorities(): readonly number[] {
        return [...this.behaviorsByPriority.keys()].sort((a, b) => a - b);
    }

    private startEachNonRunningBehavior(context: BrainContext): void {
        const timestamp = context.world.gameTime();
        for (const priority of this.ascendingPriorities()) {
            for (const [activity, behaviors] of this.behaviorsByPriority.get(priority) ?? []) {
                if (!this.activeActivities.has(activity)) {
                    continue;
                }
                for (const behavior of behaviors) {
                    if (behavior.status === 'stopped') {
                        behavior.tryStart(context, timestamp);
                    }
                }
            }
        }
    }

    private tickEachRunningBehavior(context: BrainContext): void {
        const timestamp = context.world.gameTime();
        for (const behavior of this.getRunningBehaviors()) {
            behavior.tickOrStop(context, timestamp);
        }
    }
}
