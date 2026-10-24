import { Item } from '../../item/Item';
import { Mob } from '../Mob';
import { rangedBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';
import type { Position } from '../../world/Position';

/** The same bow a skeleton carries; a stray is a skeleton that lives somewhere colder. */
const BOW = new Item({ id: 0, name: 'minecraft:bow' });

export default class Stray extends Mob {
    public static MOB_ID = 'minecraft:stray';

    public constructor(options: { position: Position; pitch?: number; yaw?: number; headYaw?: number }) {
        super(options);
        this.setHeldItem(BOW);
    }

    protected override createGoals(): GoalSelector {
        return rangedBrain();
    }
}
