import { Mob } from '../Mob';
import { villagerBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class SnowGolem extends Mob {
    public static MOB_ID = 'minecraft:snow_golem';

    public override getType(): string {
        return SnowGolem.MOB_ID;
    }

    protected override createGoals(): GoalSelector {
        return villagerBrain();
    }
}
