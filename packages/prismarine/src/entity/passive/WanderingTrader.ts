import { Mob } from '../Mob';
import { villagerBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class WanderingTrader extends Mob {
    public static MOB_ID = 'minecraft:wandering_trader';

    protected override createGoals(): GoalSelector {
        return villagerBrain();
    }
}
