import type { Mob } from '../Mob';
import type { Goal } from './Goal';
import type { GoalLane } from './Goal';

/**
 * Decides which of a mob's goals are running.
 *
 * Goals are held in priority order and offered one at a time. A goal runs if every lane it needs is
 * still free, and the lanes are claimed as it goes - so because the walk is in priority order, the
 * only thing that can ever block a goal is a more important one. That is what lets a mob walk
 * somewhere and watch you while it does, without ever letting two goals argue about where it is
 * going.
 *
 * A running goal is re-offered every tick and keeps its lanes until it either gives up or something
 * more important takes them, so behaviour does not flicker between two goals that both nearly want
 * to run.
 */
export class GoalSelector {
    private readonly goals: Goal[] = [];
    private readonly running = new Set<Goal>();

    public add(goal: Goal): this {
        this.goals.push(goal);
        this.goals.sort((a, b) => a.priority - b.priority);

        return this;
    }

    /** Which goals are currently running. Ordered by priority; used by tests and debugging. */
    public getRunning(): readonly Goal[] {
        return this.goals.filter((goal) => this.running.has(goal));
    }

    public tick(mob: Mob): void {
        // A running goal that no longer wants to run gives up its lanes before anything else is
        // offered them, so a goal waiting on it starts this tick rather than the next.
        for (const goal of [...this.running]) {
            const continues = goal.canContinue ? goal.canContinue(mob) : goal.canUse(mob);
            if (!continues) this.stop(goal, mob);
        }

        const claimed = new Set<GoalLane>();

        for (const goal of this.goals) {
            const blocked = goal.lanes.some((lane) => claimed.has(lane));
            if (blocked) {
                // Held by something more important, since the walk is in priority order.
                if (this.running.has(goal)) this.stop(goal, mob);
                continue;
            }

            // Already-running goals were vetted by the pass above; the rest have to ask.
            if (!this.running.has(goal)) {
                if (!goal.canUse(mob)) continue;

                this.running.add(goal);
                goal.start?.(mob);
            }

            for (const lane of goal.lanes) claimed.add(lane);
        }

        for (const goal of this.getRunning()) goal.tick(mob);
    }

    /** Stops everything, for a mob leaving the world. */
    public stopAll(mob: Mob): void {
        for (const goal of [...this.running]) this.stop(goal, mob);
    }

    private stop(goal: Goal, mob: Mob): void {
        this.running.delete(goal);
        goal.stop?.(mob);
    }
}

export default GoalSelector;
