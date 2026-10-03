import type { Entity } from '../../Entity';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import type { TargetFilter } from '../Targeting';
import { flatDistance, players } from '../Targeting';

/**
 * Choosing something to go after.
 *
 * Claims no lanes at all, which is the whole trick and is what lets vanilla's split between a
 * "goal selector" and a "target selector" fall out of the lane system already here rather than
 * needing a second selector beside it. A goal with no lanes blocks nothing and is blocked by
 * nothing, so picking a target runs alongside whatever is currently moving the mob - which is
 * exactly right, because deciding who to fight is not something that competes with walking.
 *
 * It only ever *finds* a target. Walking to it is `ApproachTargetGoal` and hitting it is
 * `MeleeAttackGoal`, and keeping the three apart is what lets a golem and a zombie share all the
 * pursuing and differ only in this one filter.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_nearest_attackable_target
 */
export class NearestAttackableTargetGoal implements Goal {
    public readonly name = 'nearest_attackable_target';

    /**
     * Ahead of everything that acts on a target, and behind retaliation.
     *
     * Being hit is a better reason to fight somebody than their being nearby, so `HurtByTargetGoal`
     * runs first and this one stands down while the mob already has a target.
     */
    public readonly priority = 2;

    public readonly lanes = [];

    private found: Entity | null = null;

    public constructor(
        private readonly wants: TargetFilter = players,
        private readonly range?: number
    ) {}

    public canUse(mob: Mob): boolean {
        // Something already has its attention. Re-picking every tick would make a mob swap between
        // two players who were the same distance away and never reach either.
        if (mob.getTarget()) return false;

        this.found = this.nearest(mob);
        return this.found !== null;
    }

    public canContinue(mob: Mob): boolean {
        // The mob is the one that forgets a target - see `Mob.tickTarget`. This goal is simply
        // running for as long as there is one, so that it does not start looking for another.
        return mob.getTarget() !== null;
    }

    public start(mob: Mob): void {
        if (this.found) mob.setTarget(this.found);
    }

    public stop(): void {
        this.found = null;
    }

    public tick(): void {
        // Nothing per tick: the choosing happens once, and everything after it is another goal's.
    }

    /** The closest thing the filter accepts, within range. */
    private nearest(mob: Mob): Entity | null {
        const range = this.range ?? mob.getFollowRange();

        let nearest: Entity | null = null;
        let best = range;

        // The grid rather than every entity in the world: it is rebuilt once a tick and answers
        // the 3x3 chunks around a point, which is already wider than any follow range.
        const position = mob.getPosition();
        for (const candidate of mob.getWorld().getEntityGrid().near(position.getX(), position.getZ())) {
            if (candidate === mob || !this.wants(candidate, mob)) continue;

            const distance = flatDistance(mob, candidate);
            if (distance < best) {
                best = distance;
                nearest = candidate;
            }
        }

        return nearest;
    }
}

export default NearestAttackableTargetGoal;
