import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Slime extends Mob {
    public static MOB_ID = 'minecraft:slime';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
