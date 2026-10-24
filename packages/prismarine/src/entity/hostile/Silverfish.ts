import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Silverfish extends Mob {
    public static MOB_ID = 'minecraft:silverfish';

    public override getType(): string {
        return Silverfish.MOB_ID;
    }

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
