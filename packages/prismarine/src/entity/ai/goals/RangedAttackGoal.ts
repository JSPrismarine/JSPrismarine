import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { Position } from '../../../world/Position';
import type { Entity } from '../../Entity';
import { sizeOf } from '../../EntitySize';
import type { Mob } from '../../Mob';
import Arrow from '../../other/Arrow';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';
import { flatDistance } from '../Targeting';

/**
 * Shooting at whatever the mob is after, from a distance.
 *
 * The counterpart to `MeleeAttackGoal`, and unlike it this one *does* claim the movement lane -
 * because keeping its distance is half of how an archer fights. It outranks `ApproachTargetGoal`,
 * so a skeleton that has got within bow range stops closing and starts shooting, and gives the
 * lane back when its target runs off and the approach takes over again.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_ranged_attack
 */

/** How far the mob will shoot from. Vanilla's skeleton gives up at about sixteen blocks. */
const SHOOT_RANGE = 15;

/**
 * Nearer than this and it backs off.
 *
 * An archer that let you walk up to it would be a melee mob with a worse weapon, and retreating is
 * the whole reason a bow is dangerous.
 */
const TOO_CLOSE = 4;

/**
 * Ticks between shots.
 *
 * Vanilla's skeleton fires about once a second on normal difficulty, and the bow is held drawn for
 * the whole of the gap rather than pulled at the last moment - which is why the flag is set for
 * every tick this goal runs and not only around the loose.
 */
const RELOAD_TICKS = 20;

/** How fast an arrow leaves the bow, in blocks per tick. A player's full draw is three. */
const ARROW_SPEED = 1.6;

/** How high above its feet the mob's bow is, as a fraction of its height. */
const BOW_HEIGHT = 0.8;

/**
 * How much of the gap to the target the shot is lifted by, per block of distance.
 *
 * Without it every arrow travels flat and lands short: gravity pulls a shot down over its flight,
 * so an archer has to aim above what it wants to hit. This is the crude version of vanilla's
 * ballistic solution and is enough to make a skeleton hit a player standing still.
 */
const ARC_PER_BLOCK = 0.07;

export class RangedAttackGoal implements Goal {
    public readonly name = 'ranged_attack';

    /** Ahead of `ApproachTargetGoal`, so being in range stops the mob closing any further. */
    public readonly priority = 2;

    public readonly lanes = [GoalLane.Move, GoalLane.Look];

    private reload = 0;

    public constructor(private readonly range: number = SHOOT_RANGE) {}

    public canUse(mob: Mob): boolean {
        const target = mob.getTarget();
        if (!target) return false;

        return flatDistance(mob, target) <= this.range;
    }

    public canContinue(mob: Mob): boolean {
        return this.canUse(mob);
    }

    public start(mob: Mob): void {
        // It has to draw before it can loose, so walking into range is not a free shot.
        this.reload = RELOAD_TICKS;

        // The client's entire bow-drawing pose comes from this flag. Without it a skeleton fires
        // arrows from a lowered bow, which reads as a bug rather than as an attack.
        mob.setUsingItem(true);
    }

    public stop(mob: Mob): void {
        mob.setUsingItem(false);
        mob.stopMoving();
    }

    public tick(mob: Mob): void {
        const target = mob.getTarget();
        if (!target) return;

        mob.lookAt(target.getPosition());

        const distance = flatDistance(mob, target);

        // Backing away is steered directly rather than pathed: it is a reaction to something a
        // block or two away, and planning a route for it would arrive a second late.
        if (distance < TOO_CLOSE) {
            const from = mob.getPosition();
            const at = target.getPosition();
            mob.steerTowards(from.getX() - at.getX(), from.getZ() - at.getZ());
        } else {
            mob.stopMoving();
        }

        // The bow stays up for as long as the mob is engaging, and is only lowered when the goal
        // stops. It used to be dropped for the single tick of each loose, which is worse than it
        // sounds: a client that plays its release animation when the flag goes false then shows
        // *only* that, once a shot and lasting a moment, and never the draw at all. Which is
        // exactly what a lowered bow that twitches when an arrow appears looks like.
        mob.setUsingItem(true);

        if (--this.reload > 0) return;

        this.reload = RELOAD_TICKS;
        void this.loose(mob, target);
    }

    /** Puts an arrow in the world, aimed a little above the target. */
    private async loose(mob: Mob, target: Entity): Promise<void> {
        const world = mob.getWorld();
        const from = mob.getPosition();

        const bow = mob.getFeetY() + sizeOf(mob.getType()).height * BOW_HEIGHT;
        const dx = target.getPosition().getX() - from.getX();
        const dz = target.getPosition().getZ() - from.getZ();

        // At the middle of the body, worked out from its feet rather than from its position - a
        // player's position is their eyes, so aiming at it would put every shot over their head.
        const aimY = target.getFeetY() + sizeOf(target.getType()).height / 2;
        const dy = aimY - bow;

        const flat = Math.hypot(dx, dz);
        if (flat < Number.EPSILON) return;

        const velocity = new Vector3(
            (dx / flat) * ARROW_SPEED,
            (dy + flat * ARC_PER_BLOCK) / Math.max(1, flat / ARROW_SPEED),
            (dz / flat) * ARROW_SPEED
        );

        const arrow = new Arrow({
            position: new Position(from.getX(), bow, from.getZ(), world),
            velocity,
            owner: mob
        });

        await world.addEntity(arrow);
        await world.sendActorSound(mob, LevelSoundEvent.BOW);
    }
}

export default RangedAttackGoal;
