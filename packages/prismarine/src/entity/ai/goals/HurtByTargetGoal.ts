import type { DamageSource } from '../../DamageSource';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { isAttackable } from '../Targeting';

/**
 * Fighting back at whatever just hit you.
 *
 * The goal that makes mobs fight *each other*, and it does so without knowing anything about mobs
 * fighting each other. A skeleton's arrow goes wide and hits a zombie; the zombie asks who hurt it
 * and gets the skeleton; the skeleton is now a target like any other, and every goal downstream -
 * the walking, the swinging - carries on exactly as it would against a player. None of it is
 * special-cased, which is why a creeper caught in a golem's swing behaves sensibly too.
 *
 * Claims no lanes, for the reason {@link NearestAttackableTargetGoal} explains: choosing who to
 * fight is not something that competes with walking.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_hurt_by_target
 */
export class HurtByTargetGoal implements Goal {
    public readonly name = 'hurt_by_target';

    /** Ahead of picking somebody out of a crowd: being hit outranks being noticed. */
    public readonly priority = 1;

    public readonly lanes = [];

    /**
     * The last blow this goal has already reacted to.
     *
     * `Mob.getLastDamageSource` keeps its answer indefinitely - deliberately, since a mob chased
     * for ten seconds is still fighting whoever hit it - so without remembering which one has been
     * seen, this would re-target the same attacker every tick for ever and the mob could never be
     * distracted by anything else. Identity is enough: every attributed blow builds a fresh source.
     */
    private seen: DamageSource | null = null;

    public canUse(mob: Mob): boolean {
        const source = mob.getLastDamageSource();
        if (!source || source === this.seen) return false;

        this.seen = source;

        const attacker = source.attacker;
        if (!attacker || attacker === mob || !isAttackable(attacker)) return false;

        // Straight in, rather than waiting for `start`: retaliation should be the same tick as the
        // blow, and a goal that only wanted to run would be one tick behind it.
        mob.setTarget(attacker);
        return true;
    }

    public canContinue(mob: Mob): boolean {
        return mob.getTarget() !== null;
    }

    public tick(): void {
        // Nothing per tick. The retaliation is the choosing; the fighting is other goals'.
    }
}

export default HurtByTargetGoal;
