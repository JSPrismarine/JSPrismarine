import { ActorEvent } from '../../../network/packet/ActorEventPacket';
import { distanceToBody } from '../../Combat';
import { explode } from '../../Explosion';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';

/**
 * Swelling up, and going off.
 *
 * A creeper's whole attack, and it is not a melee attack with different numbers - it is a *timer*.
 * That is why it is a goal rather than an argument to `MeleeAttackGoal`: the creeper has to stop,
 * hiss, and be interruptible for a second and a half, none of which a swing has any concept of.
 *
 * The fuse being cancellable is the point of the mob. Backing away puts it out, which is what
 * makes a creeper a thing you can beat by moving rather than a thing that simply costs you health.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_explode
 */

/** How close the target has to be for the fuse to catch. */
const IGNITE_RANGE = 3;

/**
 * How far the target may get before the fuse goes out.
 *
 * Wider than it catches at, so a creeper does not light and snuff itself every other tick while
 * its target circles at exactly the boundary.
 */
const ESCAPE_RANGE = 7;

/** How long the fuse burns, in ticks. Vanilla's second and a half. */
const FUSE_TICKS = 30;

/** Vanilla's blast power for an ordinary creeper. A charged one is twice this. */
const BLAST_POWER = 3;

export class SwellGoal implements Goal {
    public readonly name = 'swell';

    /** Above the melee goals: a creeper that is about to go off is not doing anything else. */
    public readonly priority = 1;

    /** It stops dead while it swells, so it holds the legs as well as the eyes. */
    public readonly lanes = [GoalLane.Move, GoalLane.Look];

    private fuse = 0;
    private lit = false;

    public constructor(private readonly power: number = BLAST_POWER) {}

    public canUse(mob: Mob): boolean {
        const target = mob.getTarget();
        if (!target) return false;

        return distanceToBody(mob.getPosition(), target) <= IGNITE_RANGE;
    }

    public canContinue(mob: Mob): boolean {
        const target = mob.getTarget();
        if (!target || !target.isAlive()) return false;

        return distanceToBody(mob.getPosition(), target) <= ESCAPE_RANGE;
    }

    public start(mob: Mob): void {
        this.fuse = FUSE_TICKS;
        this.lit = true;

        mob.stopMoving();

        // Two different things, and both are needed. The event is the hiss; the flag is the swell
        // the client draws. Without them a creeper stands still for a second and a half and then
        // kills you with no warning at all.
        void mob.getWorld().sendActorEvent(mob, ActorEvent.PRIME_CREEPER);
        SwellGoal.setSwelling(mob, true);
    }

    public stop(mob: Mob): void {
        // Backing off puts it out, and the client has to be told or it goes on drawing a creeper
        // mid-swell for ever.
        if (this.lit) SwellGoal.setSwelling(mob, false);

        this.lit = false;
        this.fuse = 0;
    }

    public tick(mob: Mob): void {
        const target = mob.getTarget();
        if (!target) return;

        mob.lookAt(target.getPosition());

        if (--this.fuse > 0) return;

        this.lit = false;

        // The creeper goes with it. Killed rather than merely removed, so the death runs its
        // course - the animation, the drops, the event - like any other.
        void detonate(mob, this.power);
    }

    /** Lights or snuffs the visible fuse, and tells everyone watching. */
    private static setSwelling(mob: Mob, swelling: boolean): void {
        mob.metadata.setIgnited(swelling);
        void mob.getWorld().sendActorMetadata(mob);
    }
}

/** Sets the blast off and takes the creeper with it. */
const detonate = async (mob: Mob, power: number): Promise<void> => {
    const world = mob.getWorld();
    const at = mob.getPosition();

    await explode(world, at, { power, source: mob });

    // After the blast, so the creeper is still there to be blamed for it while it is being
    // resolved - a source that had already left the world would leave the deaths unattributed.
    await mob.setHealth(0);
};

export default SwellGoal;
