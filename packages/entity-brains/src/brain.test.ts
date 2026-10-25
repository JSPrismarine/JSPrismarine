import { describe, expect, it } from 'vitest';

import { Activities, ALL_ACTIVITIES } from './activity.js';
import { activityData, Brain, prioritized, scheduledActivity } from './brain.js';
import type { BehaviorControl } from './behavior/control.js';
import { MemoryModuleTypes } from './memory.js';
import { BABY_VILLAGER_SCHEDULE, VILLAGER_SCHEDULE } from './mobs/villager.js';
import { TestWorld } from './testWorld.js';

/** A behavior that records every lifecycle call and stays running until told otherwise. */
function recorder(
    name: string,
    options: { readonly canStillUse?: boolean } = {}
): BehaviorControl & {
    readonly calls: string[];
} {
    const calls: string[] = [];
    let status: 'stopped' | 'running' = 'stopped';
    return {
        name,
        calls,
        get status() {
            return status;
        },
        requiredMemories: [],
        tryStart: () => {
            calls.push('tryStart');
            status = 'running';
            return true;
        },
        tickOrStop: () => {
            calls.push('tick');
            if (options.canStillUse === false) {
                status = 'stopped';
            }
        },
        doStop: () => {
            calls.push('stop');
            status = 'stopped';
        }
    };
}

describe('the activity registry', () => {
    it('has the 26 entries minecraft:activity reports in 26.3', () => {
        expect(ALL_ACTIVITIES).toHaveLength(26);
    });
});

describe('memory preconditions', () => {
    it('refuses every status for an unregistered memory, including registered', () => {
        const brain = new Brain({ sensors: [], activities: [] });
        expect(brain.checkMemory(MemoryModuleTypes.ATTACK_TARGET, 'registered')).toBe(false);
        expect(brain.checkMemory(MemoryModuleTypes.ATTACK_TARGET, 'value_absent')).toBe(false);
        expect(brain.checkMemory(MemoryModuleTypes.ATTACK_TARGET, 'value_present')).toBe(false);
    });

    it('answers registered and absent for a declared but empty memory', () => {
        const brain = new Brain({ memories: [MemoryModuleTypes.DANCING], sensors: [], activities: [] });
        expect(brain.checkMemory(MemoryModuleTypes.DANCING, 'registered')).toBe(true);
        expect(brain.checkMemory(MemoryModuleTypes.DANCING, 'value_absent')).toBe(true);
        expect(brain.checkMemory(MemoryModuleTypes.DANCING, 'value_present')).toBe(false);
    });

    it('treats an empty array as no value, which is what makes value_present mean "found something"', () => {
        const brain = new Brain({ memories: [MemoryModuleTypes.NEAREST_PLAYERS], sensors: [], activities: [] });
        brain.setMemory(MemoryModuleTypes.NEAREST_PLAYERS, []);
        expect(brain.hasMemoryValue(MemoryModuleTypes.NEAREST_PLAYERS)).toBe(false);
    });

    it('drops a write to a memory it never registered', () => {
        const brain = new Brain({ sensors: [], activities: [] });
        brain.setMemory(MemoryModuleTypes.DANCING, true);
        expect(brain.getMemory(MemoryModuleTypes.DANCING)).toBeUndefined();
    });

    it('registers every memory a behavior declares', () => {
        const brain = new Brain({
            sensors: [],
            activities: [
                activityData(Activities.IDLE, [
                    [0, { ...recorder('Writer'), requiredMemories: [MemoryModuleTypes.CELEBRATE_LOCATION] }]
                ])
            ]
        });
        expect(brain.checkMemory(MemoryModuleTypes.CELEBRATE_LOCATION, 'registered')).toBe(true);
    });
});

describe('the activity stack', () => {
    it('starts on the default activity, with the core activity always active', () => {
        const brain = new Brain({ sensors: [], activities: [] });
        expect(brain.isActive(Activities.CORE)).toBe(true);
        expect(brain.isActive(Activities.IDLE)).toBe(true);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
    });

    it('refuses an activity the mob never registered, and falls back to the default', () => {
        const brain = new Brain({ sensors: [], activities: [] });
        brain.setActiveActivityIfPossible(Activities.FIGHT);
        expect(brain.isActive(Activities.FIGHT)).toBe(false);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
    });

    it('accepts a registered activity with an empty condition set, as Java does', () => {
        const brain = new Brain({
            sensors: [],
            activities: [activityData(Activities.FIGHT, [[0, recorder('Fight')]])]
        });
        brain.setActiveActivityIfPossible(Activities.FIGHT);
        expect(brain.isActive(Activities.FIGHT)).toBe(true);
    });

    it('takes the first activity in the list whose memory conditions hold', () => {
        const brain = new Brain({
            memories: [MemoryModuleTypes.ATTACK_TARGET, MemoryModuleTypes.AVOID_TARGET],
            sensors: [],
            activities: [
                activityData(Activities.FIGHT, [[0, recorder('Fight')]], { gatedBy: MemoryModuleTypes.ATTACK_TARGET }),
                activityData(Activities.AVOID, [[0, recorder('Avoid')]], { gatedBy: MemoryModuleTypes.AVOID_TARGET }),
                activityData(Activities.IDLE, [[0, recorder('Idle')]], { conditions: [] })
            ]
        });
        const target = {
            id: 'a',
            type: 'minecraft:player',
            typeTags: new Set<string>(),
            position: { x: 0, y: 0, z: 0 },
            alive: true,
            baby: false,
            spectator: false,
            conditions: new Set<string>()
        };
        brain.setMemory(MemoryModuleTypes.AVOID_TARGET, target);
        brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.AVOID, Activities.IDLE]);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.AVOID);

        brain.setMemory(MemoryModuleTypes.ATTACK_TARGET, target);
        brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.AVOID, Activities.IDLE]);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);
    });

    it('erases the leaving activity memories when it switches', () => {
        const brain = new Brain({
            memories: [MemoryModuleTypes.ATTACK_TARGET, MemoryModuleTypes.CELEBRATE_LOCATION],
            sensors: [],
            activities: [
                activityData(Activities.CELEBRATE, [[0, recorder('Celebrate')]], {
                    gatedBy: MemoryModuleTypes.CELEBRATE_LOCATION
                }),
                activityData(Activities.FIGHT, [[0, recorder('Fight')]], { gatedBy: MemoryModuleTypes.ATTACK_TARGET })
            ]
        });
        brain.setMemory(MemoryModuleTypes.CELEBRATE_LOCATION, { x: 0, y: 0, z: 0 });
        brain.setActiveActivityToFirstValid([Activities.CELEBRATE]);
        brain.setMemory(MemoryModuleTypes.ATTACK_TARGET, undefined);
        brain.setMemory(MemoryModuleTypes.ATTACK_TARGET, {
            id: 'a',
            type: 'minecraft:player',
            typeTags: new Set<string>(),
            position: { x: 0, y: 0, z: 0 },
            alive: true,
            baby: false,
            spectator: false,
            conditions: new Set<string>()
        });
        brain.setActiveActivityToFirstValid([Activities.FIGHT]);
        expect(brain.hasMemoryValue(MemoryModuleTypes.CELEBRATE_LOCATION)).toBe(false);
    });

    it('runs core behaviors alongside the chosen activity, in ascending priority order', () => {
        const world = new TestWorld();
        const body = world.spawn('minecraft:test', { x: 0, y: 0, z: 0 });
        const core = recorder('Core');
        const idle = recorder('Idle');
        const fight = recorder('Fight');
        const brain = new Brain({
            sensors: [],
            activities: [
                activityData(Activities.CORE, prioritized(0, [core])),
                activityData(Activities.IDLE, prioritized(5, [idle])),
                activityData(Activities.FIGHT, prioritized(5, [fight]), { conditions: [] })
            ]
        });
        body.attach(brain);
        brain.tick(body.context);
        expect(core.calls).toEqual(['tryStart', 'tick']);
        expect(idle.calls).toEqual(['tryStart', 'tick']);
        expect(fight.calls).toEqual([]);
    });

    it('starts a behavior and ticks it in the same brain tick', () => {
        const world = new TestWorld();
        const body = world.spawn('minecraft:test', { x: 0, y: 0, z: 0 });
        const behavior = recorder('Once', { canStillUse: false });
        const brain = new Brain({ sensors: [], activities: [activityData(Activities.IDLE, [[0, behavior]])] });
        body.attach(brain);
        brain.tick(body.context);
        expect(behavior.calls).toEqual(['tryStart', 'tick']);
    });
});

describe('the villager schedule, read from data/minecraft/timeline/villager_schedule.json', () => {
    it('sends an adult to work at 2000 and to meet at 9000', () => {
        expect(scheduledActivity(VILLAGER_SCHEDULE, 1999)).toBe(Activities.IDLE);
        expect(scheduledActivity(VILLAGER_SCHEDULE, 2000)).toBe(Activities.WORK);
        expect(scheduledActivity(VILLAGER_SCHEDULE, 8999)).toBe(Activities.WORK);
        expect(scheduledActivity(VILLAGER_SCHEDULE, 9000)).toBe(Activities.MEET);
        expect(scheduledActivity(VILLAGER_SCHEDULE, 11000)).toBe(Activities.IDLE);
        expect(scheduledActivity(VILLAGER_SCHEDULE, 12000)).toBe(Activities.REST);
    });

    it('sends a baby to play at 3000 and 10000 and never to work', () => {
        expect(scheduledActivity(BABY_VILLAGER_SCHEDULE, 3000)).toBe(Activities.PLAY);
        expect(scheduledActivity(BABY_VILLAGER_SCHEDULE, 6000)).toBe(Activities.IDLE);
        expect(scheduledActivity(BABY_VILLAGER_SCHEDULE, 10000)).toBe(Activities.PLAY);
        expect(BABY_VILLAGER_SCHEDULE.keyframes.map(([, activity]) => activity)).not.toContain(Activities.WORK);
    });

    it('wraps the last keyframe into the start of the next day, because the first is at tick 10', () => {
        expect(scheduledActivity(VILLAGER_SCHEDULE, 5)).toBe(Activities.REST);
        expect(scheduledActivity(VILLAGER_SCHEDULE, 24005)).toBe(Activities.REST);
    });
});

describe('the twenty-tick schedule throttle, Brain.SCHEDULE_UPDATE_DELAY', () => {
    it('ignores a schedule change for twenty ticks after the last read', () => {
        const brain = new Brain({
            sensors: [],
            activities: [
                activityData(Activities.IDLE, [], { conditions: [] }),
                activityData(Activities.REST, [], { conditions: [] })
            ],
            schedule: VILLAGER_SCHEDULE
        });
        brain.updateActivityFromSchedule(1000, 11000);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        brain.updateActivityFromSchedule(1010, 12000);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        brain.updateActivityFromSchedule(1021, 12000);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.REST);
    });
});
