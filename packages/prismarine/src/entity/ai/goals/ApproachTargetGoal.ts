import type { Entity } from '../../Entity';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';
import { flatDistance } from '../Targeting';

/**
 * Walking towards whatever the mob is after.
 *
 * What makes a hostile mob hostile, and a golem a guard. It claims both the move and look lanes,
 * so a mob coming for you is looking at you while it does - which is the difference between being
 * chased and being drifted towards.
 *
 * This used to find its own target, scanning the world for the nearest player. It does not any
 * more, and the change is what let the same goal serve a zombie chasing a person and a golem
 * chasing a zombie: choosing is `NearestAttackableTargetGoal`'s, hitting is `MeleeAttackGoal`'s,
 * and all this does is close the distance to whatever `Mob.getTarget` says.
 *
 * It is the one goal whose destination moves, so it is the one that re-plans - a mob strolling to
 * a fixed spot has no reason to, and making that the navigator's job meant every wandering mob
 * paid for a search a second to arrive at the answer it already had. Even here it is on a timer
 * rather than every tick: the route is only walked a fraction of a block per tick, so a target has
 * to move a fair way before the old one is meaningfully wrong.
 */

/** Ticks between route recalculations while pursuing. */
const REPATH_INTERVAL = 20;

/** How close the mob tries to get. Nearer than this and it stops rather than jostling. */
const REACH = 1.8;

export class ApproachTargetGoal implements Goal {
    public readonly name = 'approach_target';
    public readonly priority = 3;
    public readonly lanes = [GoalLane.Move, GoalLane.Look];

    private ticksSincePath = 0;

    public constructor(private readonly speed?: number) {}

    public canUse(mob: Mob): boolean {
        return mob.getTarget() !== null;
    }

    public start(): void {
        // Zero rather than the interval, so pursuit begins with a route rather than after a second
        // of standing there.
        this.ticksSincePath = 0;
    }

    public stop(mob: Mob): void {
        mob.stopMoving();
    }

    public tick(mob: Mob): void {
        const target = mob.getTarget();
        if (!target) return;

        const at = target.getPosition();

        // As reported, which for a player is already their eye - see `EYE_HEIGHT`. Looking at
        // their feet would have every mob staring at the floor in front of them.
        mob.lookAt(at);

        if (flatDistance(mob, target) <= REACH) {
            mob.stopMoving();
            this.ticksSincePath = REPATH_INTERVAL;
            return;
        }

        // A new route when the old one has run out, or when the target has had time to move away
        // from where it was planned to.
        this.ticksSincePath++;
        if (!mob.isMoving() || this.ticksSincePath >= REPATH_INTERVAL) {
            this.ticksSincePath = 0;

            // Walked towards the target's *feet*. The route is planned on the block grid, so
            // aiming at a player's reported position put the goal a block and a half above the
            // ground - a cell the pathfinder has to reach and cannot stand in.
            mob.moveTo(at.withY(ApproachTargetGoal.feetOf(target)), this.speed);
        }
    }

    /** Where the target's body actually starts, which is not where a player reports being. */
    private static feetOf(target: Entity): number {
        return target.getFeetY();
    }
}

export default ApproachTargetGoal;
