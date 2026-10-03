import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';
import SwellGoal from '../ai/goals/SwellGoal';

export default class Creeper extends Mob {
    public static MOB_ID = 'minecraft:creeper';

    /**
     * A hostile mob whose attack is a timer rather than a swing.
     *
     * The ordinary hostile brain plus the fuse. The melee goal is still in there and does nothing,
     * because a creeper's attack attribute is zero - which is how the table says "this one does not
     * punch" without anything having to special-case it.
     */
    protected override createGoals(): GoalSelector {
        return hostileBrain().add(new SwellGoal());
    }
}
