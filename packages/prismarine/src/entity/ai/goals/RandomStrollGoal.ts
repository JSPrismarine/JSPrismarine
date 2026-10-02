import { Vector3 } from '@jsprismarine/math';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';
import { STROLL_CHANCE, STROLL_HEIGHT, STROLL_MULTIPLIER, STROLL_RANGE } from '../Speed';

/**
 * Wandering about with no particular purpose.
 *
 * Modelled on vanilla's `minecraft:behavior.random_stroll`, and the part worth copying exactly is
 * *when* it runs rather than what it does: a one in a hundred and twenty chance every tick, which
 * makes the wait between strolls geometric with a mean of six seconds and a long tail. A mob
 * therefore sometimes sets off immediately and sometimes stands about for half a minute.
 *
 * That distribution is the whole difference between a field that looks alive and one that looks
 * mechanical. A fixed pause, or a uniform random one, makes every animal in sight set off at
 * roughly the same rate - so a herd visibly pulses, and each individual is plainly on a timer.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_random_stroll
 */

/** Attempts at finding somewhere to walk to before giving up for this go. */
const ATTEMPTS = 6;

/**
 * How much of the previous heading is kept, in degrees either side.
 *
 * Not vanilla, which picks uniformly in a box. Uniform picking makes a mob as likely to double back
 * as to carry on, and reversing on the spot reads as a glitch even when the walk itself is smooth.
 */
const HEADING_SPREAD = 110;

export class RandomStrollGoal implements Goal {
    public readonly name = 'random_stroll';
    public readonly priority = 7;
    public readonly lanes = [GoalLane.Move];

    private heading = Math.random() * 360;

    public constructor(private readonly speed?: number) {}

    public canUse(mob: Mob): boolean {
        if (mob.isMoving()) return false;

        return Math.random() < STROLL_CHANCE;
    }

    public canContinue(mob: Mob): boolean {
        return mob.isMoving();
    }

    public start(mob: Mob): void {
        const destination = this.findSomewhereToGo(mob);
        if (!destination) return;

        mob.moveTo(destination, this.speed ?? mob.getWalkSpeed() * STROLL_MULTIPLIER);
    }

    public tick(): void {
        // The walking is the navigator's job; there is nothing to do each tick but let it happen.
    }

    /**
     * Somewhere nearby worth walking to.
     *
     * Candidates are thrown at the world and tested rather than searched for, which is both cheap
     * and what makes a stroll look aimless. Only the ground matters here: whether there is a route
     * is the navigator's question, and it will refuse the destination if there is not.
     */
    private findSomewhereToGo(mob: Mob): Vector3 | null {
        const view = mob.getBlockView();
        const from = mob.getPosition();

        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            // Roughly onwards, so a mob keeps its general direction of travel between strolls.
            const angle = this.heading + (Math.random() * 2 - 1) * HEADING_SPREAD;
            const distance = 2 + Math.random() * (STROLL_RANGE - 2);
            const radians = (angle * Math.PI) / 180;

            const x = Math.floor(from.getX() + Math.cos(radians) * distance);
            const z = Math.floor(from.getZ() + Math.sin(radians) * distance);

            // Follow the ground up or down a little rather than insisting on the same height.
            const y = view.groundBelow(x, Math.floor(from.getY()) + 2, z, STROLL_HEIGHT);
            if (y === null) continue;

            this.heading = angle;
            return new Vector3(x + 0.5, y, z + 0.5);
        }

        return null;
    }
}

export default RandomStrollGoal;
