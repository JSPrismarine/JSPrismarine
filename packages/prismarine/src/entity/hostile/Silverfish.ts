import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Silverfish extends Mob {
    public static MOB_ID = 'minecraft:silverfish';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
