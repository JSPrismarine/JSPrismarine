import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Zombie extends Mob {
    public static MOB_ID = 'minecraft:zombie';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
