import { Mob } from '../Mob';
import { guardianBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class IronGolem extends Mob {
    public static MOB_ID = 'minecraft:iron_golem';

    /**
     * It guards, rather than mills about.
     *
     * The same brain a zombie has with one filter changed - it hunts monsters instead of people -
     * which is what makes a golem drive raiders out of a village without any of the goals knowing
     * that mobs can fight each other.
     */
    protected override createGoals(): GoalSelector {
        return guardianBrain();
    }
}
