import { describe, expect, it } from 'vitest';

import type { ControlFlag, Goal, ScheduledGoal } from './goals';
import { GoalScheduler } from './goals';

/** Records what the scheduler did to it, so a test reads the order rather than inferring it. */
class RecordingGoal implements Goal {
    public readonly log: string[] = [];
    public ready = false;

    public constructor(
        private readonly label: string,
        private readonly sink: string[]
    ) {}

    public canStart(): boolean {
        return this.ready;
    }

    public start(): void {
        this.sink.push(`start ${this.label}`);
    }

    public stop(): void {
        this.sink.push(`stop ${this.label}`);
    }

    public tick(): void {
        this.sink.push(`tick ${this.label}`);
    }
}

const entry = (name: string, priority: number, controlFlags: readonly ControlFlag[], goal: Goal): ScheduledGoal => ({
    name,
    priority,
    controlFlags,
    goal
});

describe('GoalScheduler', () => {
    it('starts the highest priority runnable goal for a control flag', () => {
        const log: string[] = [];
        const scheduler = new GoalScheduler();
        const low = new RecordingGoal('stroll', log);
        const high = new RecordingGoal('panic', log);
        scheduler.add(entry('stroll', 6, ['move'], low));
        scheduler.add(entry('panic', 1, ['move'], high));
        low.ready = true;
        high.ready = true;

        scheduler.tick();

        expect(scheduler.runningGoals()).toEqual(['panic']);
        expect(scheduler.holderOf('move')).toBe('panic');
        expect(log).toEqual(['start panic', 'tick panic']);
    });

    it('lets goals with different control flags run at the same time', () => {
        const log: string[] = [];
        const scheduler = new GoalScheduler();
        const move = new RecordingGoal('stroll', log);
        const look = new RecordingGoal('look', log);
        const jump = new RecordingGoal('float', log);
        scheduler.add(entry('stroll', 6, ['move'], move));
        scheduler.add(entry('look', 7, ['look'], look));
        scheduler.add(entry('float', 0, ['jump'], jump));
        for (const goal of [move, look, jump]) goal.ready = true;

        scheduler.tick();

        expect(scheduler.runningGoals()).toEqual(['float', 'stroll', 'look']);
        expect(scheduler.holderOf('jump')).toBe('float');
        expect(scheduler.holderOf('move')).toBe('stroll');
        expect(scheduler.holderOf('look')).toBe('look');
    });

    it('preempts a running goal when a better priority one becomes ready', () => {
        const log: string[] = [];
        const scheduler = new GoalScheduler();
        const stroll = new RecordingGoal('stroll', log);
        const panic = new RecordingGoal('panic', log);
        scheduler.add(entry('stroll', 6, ['move'], stroll));
        scheduler.add(entry('panic', 1, ['move'], panic));
        stroll.ready = true;

        scheduler.tick();
        expect(scheduler.holderOf('move')).toBe('stroll');

        panic.ready = true;
        log.length = 0;
        scheduler.tick();

        expect(scheduler.runningGoals()).toEqual(['panic']);
        expect(log).toEqual(['stop stroll', 'start panic', 'tick panic']);
    });

    it('does not let a worse priority goal take a held flag', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const panic = new RecordingGoal('panic', log);
        const stroll = new RecordingGoal('stroll', log);
        scheduler.add(entry('panic', 1, ['move'], panic));
        scheduler.add(entry('stroll', 6, ['move'], stroll));
        panic.ready = true;
        stroll.ready = true;

        scheduler.tick();
        scheduler.tick();

        expect(scheduler.runningGoals()).toEqual(['panic']);
    });

    it('releases the control flag when a running goal cannot continue', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const panic = new RecordingGoal('panic', log);
        const stroll = new RecordingGoal('stroll', log);
        scheduler.add(entry('panic', 1, ['move'], panic));
        scheduler.add(entry('stroll', 6, ['move'], stroll));
        panic.ready = true;
        stroll.ready = true;
        scheduler.tick();

        panic.ready = false;
        log.length = 0;
        scheduler.tick();

        expect(scheduler.holderOf('move')).toBe('stroll');
        expect(log).toEqual(['stop panic', 'start stroll', 'tick stroll']);
    });

    it('asks canContinue of a running goal and canStart of an idle one', () => {
        const asked: string[] = [];
        const scheduler = new GoalScheduler();
        scheduler.add(
            entry('probe', 1, ['move'], {
                canStart: () => {
                    asked.push('canStart');
                    return true;
                },
                canContinue: () => {
                    asked.push('canContinue');
                    return true;
                }
            })
        );

        scheduler.tick();
        scheduler.tick();

        expect(asked).toEqual(['canStart', 'canContinue']);
    });

    it('falls back to canStart when a goal declares no canContinue', () => {
        let ready = true;
        const scheduler = new GoalScheduler();
        scheduler.add(entry('probe', 1, ['move'], { canStart: () => ready }));

        scheduler.tick();
        expect(scheduler.runningGoals()).toEqual(['probe']);

        ready = false;
        scheduler.tick();
        expect(scheduler.runningGoals()).toEqual([]);
    });

    it('runs a goal with no control flags alongside everything else', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const target = new RecordingGoal('target', log);
        const stroll = new RecordingGoal('stroll', log);
        scheduler.add(entry('target', 2, [], target));
        scheduler.add(entry('stroll', 6, ['move'], stroll));
        target.ready = true;
        stroll.ready = true;

        scheduler.tick();

        expect(scheduler.runningGoals()).toEqual(['target', 'stroll']);
    });

    it('stops a running goal when it is removed', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const stroll = new RecordingGoal('stroll', log);
        scheduler.add(entry('stroll', 6, ['move'], stroll));
        stroll.ready = true;
        scheduler.tick();

        scheduler.remove('stroll');

        expect(log).toContain('stop stroll');
        expect(scheduler.holderOf('move')).toBeUndefined();
        expect(scheduler.names()).toEqual([]);
    });

    it('breaks a priority tie by name so the order is stable', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const a = new RecordingGoal('a', log);
        const b = new RecordingGoal('b', log);
        scheduler.add(entry('b', 3, [], b));
        scheduler.add(entry('a', 3, [], a));
        a.ready = true;
        b.ready = true;

        scheduler.tick();

        expect(scheduler.runningGoals()).toEqual(['a', 'b']);
    });

    it('puts a goal added after a tick in its place in the order', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const late = new RecordingGoal('late', log);
        const early = new RecordingGoal('early', log);
        scheduler.add(entry('late', 5, [], late));
        late.ready = true;
        scheduler.tick();

        scheduler.add(entry('early', 1, [], early));
        early.ready = true;
        scheduler.tick();

        expect(scheduler.names()).toEqual(['early', 'late']);
        expect(scheduler.runningGoals()).toEqual(['early', 'late']);
    });

    it('takes a goal removed after a tick back out of the order', () => {
        const scheduler = new GoalScheduler();
        const log: string[] = [];
        const kept = new RecordingGoal('kept', log);
        const dropped = new RecordingGoal('dropped', log);
        scheduler.add(entry('kept', 1, [], kept));
        scheduler.add(entry('dropped', 2, [], dropped));
        kept.ready = true;
        dropped.ready = true;
        scheduler.tick();

        scheduler.remove('dropped');
        scheduler.tick();

        expect(scheduler.names()).toEqual(['kept']);
        expect(scheduler.runningGoals()).toEqual(['kept']);
    });
});
