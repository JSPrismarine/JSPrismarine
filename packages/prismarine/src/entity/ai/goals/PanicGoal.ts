import { Vector3 } from '@jsprismarine/math';
import type { DamageSource } from '../../DamageSource';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';
import { PANIC_MULTIPLIER } from '../Speed';

/**
 * Bolting after being hurt.
 *
 * What an animal does instead of fighting back, and the reason a cow is not simply a zombie with
 * no attack: being hit has to *do* something, or a herd stands placidly while it is slaughtered.
 *
 * Priority zero, above everything: a panicking animal has stopped grazing and stopped watching
 * you, and a stroll that carried on underneath would fight the flight for the same lane.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_panic
 */

/** How long the mob keeps running. Vanilla's panic lasts a few seconds. */
const PANIC_TICKS = 60;

/** How far it tries to get. */
const FLEE_DISTANCE = 12;

/** Attempts at finding somewhere to run before settling for standing still. */
const ATTEMPTS = 6;

/** How far either side of straight-away the mob will accept, in degrees. */
const SPREAD = 60;

export class PanicGoal implements Goal {
    public readonly name = 'panic';
    public readonly priority = 0;
    public readonly lanes = [GoalLane.Move];

    /** The blow already reacted to - see `HurtByTargetGoal`, which needs the same guard. */
    private seen: DamageSource | null = null;

    private ticksLeft = 0;

    public canUse(mob: Mob): boolean {
        const source = mob.getLastDamageSource();
        if (!source || source === this.seen) return false;

        this.seen = source;
        this.ticksLeft = PANIC_TICKS;

        return this.runAway(mob, source);
    }

    public canContinue(mob: Mob): boolean {
        return this.ticksLeft > 0 && mob.isMoving();
    }

    public stop(mob: Mob): void {
        this.ticksLeft = 0;
        mob.stopMoving();
    }

    public tick(mob: Mob): void {
        this.ticksLeft--;

        // Somewhere further off once the first dash is done, so a frightened animal keeps going
        // rather than stopping dead the moment it arrives.
        if (this.ticksLeft > 0 && !mob.isMoving()) this.runAway(mob, mob.getLastDamageSource());
    }

    /**
     * Sends the mob away from whatever hurt it, or anywhere at all if nothing was to blame.
     * @param {Mob} mob - Who is running.
     * @param {DamageSource | null} source - What hurt it; drowning and falling have no direction.
     * @returns {boolean} `true` if somewhere to run was found.
     */
    private runAway(mob: Mob, source: DamageSource | null): boolean {
        const view = mob.getBlockView();
        const from = mob.getPosition();
        const origin = source?.getKnockbackOrigin();

        // Directly away from the blow where there was one. A fall or a drowning has no direction,
        // so the mob just goes - which still gets it out of the fire it is standing in.
        const away = origin
            ? (Math.atan2(from.getZ() - origin.getZ(), from.getX() - origin.getX()) * 180) / Math.PI
            : Math.random() * 360;

        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            const angle = away + (Math.random() * 2 - 1) * SPREAD;
            const radians = (angle * Math.PI) / 180;

            const x = Math.floor(from.getX() + Math.cos(radians) * FLEE_DISTANCE);
            const z = Math.floor(from.getZ() + Math.sin(radians) * FLEE_DISTANCE);

            const y = view.groundBelow(x, Math.floor(from.getY()) + 2, z, FLEE_DISTANCE);
            if (y === null) continue;

            if (mob.moveTo(new Vector3(x + 0.5, y, z + 0.5), mob.getWalkSpeed() * PANIC_MULTIPLIER)) return true;
        }

        return false;
    }
}

export default PanicGoal;
