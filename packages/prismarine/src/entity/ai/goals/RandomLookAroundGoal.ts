import { Vector3 } from '@jsprismarine/math';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';
import { LOOK_AROUND_CHANCE } from '../Speed';

/**
 * Glancing about at nothing in particular.
 *
 * Vanilla's `minecraft:behavior.random_look_around`, and the lowest priority thing in a cow's whole
 * list. It exists because a mob that is not walking anywhere and has nobody to watch would
 * otherwise stare rigidly in one direction, which is what makes a standing animal look like a
 * statue - and since vanilla mobs spend most of their time standing, that is most of the time.
 *
 * It claims only the look lane, so it costs a walking mob nothing and is dropped the instant
 * anything more interesting wants the head.
 */

/** How long one glance is held, in ticks. */
const MIN_HOLD = 20;
const MAX_HOLD = 80;

/** How far away the mob pretends to be looking. Far enough that the pitch stays near level. */
const FOCUS_DISTANCE = 10;

export class RandomLookAroundGoal implements Goal {
    public readonly name = 'random_look_around';
    public readonly priority = 9;
    public readonly lanes = [GoalLane.Look];

    private hold = 0;
    private at: Vector3 | null = null;

    public canUse(): boolean {
        return Math.random() < LOOK_AROUND_CHANCE;
    }

    public canContinue(): boolean {
        return this.hold > 0;
    }

    public start(mob: Mob): void {
        this.hold = MIN_HOLD + Math.floor(Math.random() * (MAX_HOLD - MIN_HOLD));

        const angle = Math.random() * Math.PI * 2;
        const position = mob.getPosition();

        this.at = new Vector3(
            position.getX() + Math.cos(angle) * FOCUS_DISTANCE,
            // Slightly above its own eyes, so a glance is level rather than at the ground.
            position.getY() + 1.5,
            position.getZ() + Math.sin(angle) * FOCUS_DISTANCE
        );
    }

    public stop(): void {
        this.at = null;
    }

    public tick(mob: Mob): void {
        this.hold--;
        if (this.at) mob.lookAt(this.at);
    }
}

export default RandomLookAroundGoal;
