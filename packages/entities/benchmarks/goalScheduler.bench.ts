/** Times `GoalScheduler.tick` across representative goal counts: `pnpm bench`. */
import { GoalScheduler } from '../src/goals';

import type { ControlFlag } from '../src/goals';

const FLAG_SETS: ReadonlyArray<readonly ControlFlag[]> = [['move'], ['look'], ['move', 'look'], ['jump'], []];
const TICKS = 200_000;

const measure = (goalCount: number): number => {
    const scheduler = new GoalScheduler();
    for (let index = 0; index < goalCount; index++) {
        scheduler.add({
            name: `goal-${index}`,
            priority: index,
            controlFlags: FLAG_SETS[index % FLAG_SETS.length]!,
            goal: { canStart: () => index % 3 === 0 }
        });
    }

    for (let warmup = 0; warmup < 20_000; warmup++) scheduler.tick();
    const started = performance.now();
    for (let tick = 0; tick < TICKS; tick++) scheduler.tick();
    return ((performance.now() - started) * 1e6) / TICKS;
};

for (const goalCount of [4, 12, 24]) console.log(`${goalCount} goals: ${measure(goalCount).toFixed(0)} ns/tick`);
