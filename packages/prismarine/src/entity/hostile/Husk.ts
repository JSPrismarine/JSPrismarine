import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Husk extends Mob {
    public static MOB_ID = 'minecraft:husk';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
