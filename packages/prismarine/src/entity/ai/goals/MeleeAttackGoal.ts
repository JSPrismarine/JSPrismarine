import { ActorEvent } from '../../../network/packet/ActorEventPacket';
import { distanceToBody, meleeAttack } from '../../Combat';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';

/**
 * Swinging at whatever the mob is already after.
 *
 * Only the swing. Getting there is `ApproachTargetGoal`'s job and choosing who is
 * `NearestAttackableTargetGoal`'s, and the split is what makes the whole thing composable: a
 * zombie and an iron golem run identical pursuit and differ in one filter, and a mob that should
 * chase but never hit simply leaves this goal out.
 *
 * Claims no lanes, so it does not fight the goal that is walking the mob into range - it is a
 * thing the mob does *while* moving, not instead of.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_melee_attack
 */

/**
 * How close the mob's body has to be to the target's before it can land a blow.
 *
 * Measured between the two bodies rather than the two positions, so a tall mob and a short one
 * both reach at arm's length instead of the taller one having to overlap its target.
 */
const ATTACK_RANGE = 2;

/** Ticks between swings. Vanilla's mobs attack about once a second. */
const ATTACK_INTERVAL = 20;

export class MeleeAttackGoal implements Goal {
    public readonly name = 'melee_attack';
    public readonly priority = 2;
    public readonly lanes = [];

    private cooldown = 0;

    public constructor(private readonly range: number = ATTACK_RANGE) {}

    public canUse(mob: Mob): boolean {
        return mob.getTarget() !== null;
    }

    public start(): void {
        // A mob that has just noticed somebody does not get a free hit for having noticed them
        // slowly: the first swing waits like every other.
        this.cooldown = ATTACK_INTERVAL;
    }

    public tick(mob: Mob): void {
        if (this.cooldown > 0) this.cooldown--;

        const target = mob.getTarget();
        if (!target || this.cooldown > 0) return;

        if (distanceToBody(mob.getPosition(), target) > this.range) return;

        this.cooldown = ATTACK_INTERVAL;

        // The arm coming down. Vanilla calls this event `StartAttacking`; without it the target is
        // hurt by something that visibly never moved.
        void mob.getWorld().sendActorEvent(mob, ActorEvent.START_ATTACKING);

        // Not awaited: a goal's tick is synchronous, and the blow does not need to be resolved
        // before the mob's physics run. Anything that goes wrong inside is the damage pipeline's
        // to report, not this goal's to wait for.
        void meleeAttack(mob, target, {
            reach: this.range,
            damage: mob.getAttackDamage()
        });
    }
}

export default MeleeAttackGoal;
