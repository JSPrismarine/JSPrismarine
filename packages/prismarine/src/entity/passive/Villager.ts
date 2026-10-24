import { Mob } from '../Mob';
import { villagerBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Villager extends Mob {
    public static MOB_ID = 'minecraft:villager_v2';

    protected override createGoals(): GoalSelector {
        return villagerBrain();
    }
}
