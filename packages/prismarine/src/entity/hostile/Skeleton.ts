import { Item } from '../../item/Item';
import { Mob } from '../Mob';
import { rangedBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';
import type { Position } from '../../world/Position';

/** What every skeleton is carrying. Built once: nothing mutates it, so nothing needs its own. */
const BOW = new Item({ id: 0, name: 'minecraft:bow' });

export default class Skeleton extends Mob {
    public static MOB_ID = 'minecraft:skeleton';

    public constructor(options: { position: Position; pitch?: number; yaw?: number; headYaw?: number }) {
        super(options);

        // Cosmetic, and load-bearing for exactly that reason: nothing reads this to decide how the
        // skeleton fights - that is the ranged goal's business - but a skeleton with an empty hand
        // shoots arrows out of its fist.
        this.setHeldItem(BOW);
    }

    protected override createGoals(): GoalSelector {
        return rangedBrain();
    }
}
