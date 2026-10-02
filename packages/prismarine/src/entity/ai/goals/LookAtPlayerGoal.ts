import type { Mob } from '../../Mob';
import type Player from '../../../Player';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';
import { LOOK_CHANCE, LOOK_DISTANCE } from '../Speed';

/**
 * Watching whoever is nearest.
 *
 * Only claims the look lane, so a mob keeps walking while it turns to watch you - which is most of
 * what makes a mob feel alive rather than scripted, and costs one vector subtraction a tick.
 *
 * Vanilla's `look_at_player` gives a cow `look_distance: 6.0` and `probability: 0.02` - two percent
 * a tick, not "whenever somebody is nearby". That matters more than it sounds: a mob that locks on
 * the moment you come into range and tracks you continuously is most of what makes a herd look
 * mechanical. Real ones glance up, watch for a moment, and go back to ignoring you.
 * @see https://github.com/Mojang/bedrock-samples/tree/main/behavior_pack/entities/cow.json
 */

/** Roughly how long a mob holds its gaze before losing interest, in ticks. */
const MIN_INTEREST = 40;
const MAX_INTEREST = 120;

export class LookAtPlayerGoal implements Goal {
    public readonly name = 'look_at_player';
    public readonly priority = 6;
    public readonly lanes = [GoalLane.Look];

    private target: Player | null = null;
    private interest = 0;

    public constructor(
        private readonly range: number = LOOK_DISTANCE,
        private readonly probability: number = LOOK_CHANCE
    ) {}

    public canUse(mob: Mob): boolean {
        if (Math.random() >= this.probability) return false;

        this.target = this.nearestPlayer(mob);
        return this.target !== null;
    }

    public canContinue(mob: Mob): boolean {
        if (this.interest <= 0 || !this.target?.isOnline()) return false;

        return this.distanceTo(mob, this.target) <= this.range;
    }

    public start(): void {
        this.interest = MIN_INTEREST + Math.floor(Math.random() * (MAX_INTEREST - MIN_INTEREST));
    }

    public tick(mob: Mob): void {
        this.interest--;
        if (!this.target) return;

        // A player's reported position already *is* their eye position - see `EYE_HEIGHT` - so
        // this is head height with nothing added. Adding an eye height on top of one aimed every
        // mob a block and a half over the top of the player's head.
        mob.lookAt(this.target.getPosition());
    }

    private nearestPlayer(mob: Mob): Player | null {
        let nearest: Player | null = null;
        let best = this.range;

        for (const player of mob.getWorld().getPlayers()) {
            const distance = this.distanceTo(mob, player);
            if (distance < best) {
                best = distance;
                nearest = player;
            }
        }

        return nearest;
    }

    private distanceTo(mob: Mob, player: Player): number {
        const from = mob.getPosition();
        const to = player.getPosition();

        return Math.hypot(to.getX() - from.getX(), to.getY() - from.getY(), to.getZ() - from.getZ());
    }
}

export default LookAtPlayerGoal;
