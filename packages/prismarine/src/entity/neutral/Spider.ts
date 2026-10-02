import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Spider extends Mob {
    public static MOB_ID = 'minecraft:spider';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
