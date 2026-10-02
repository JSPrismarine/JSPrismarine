import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class CaveSpider extends Mob {
    public static MOB_ID = 'minecraft:cave_spider';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
