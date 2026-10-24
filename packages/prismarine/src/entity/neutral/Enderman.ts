import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Endermand extends Mob {
    public static MOB_ID = 'minecraft:enderman';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
