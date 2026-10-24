import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class ZombieVillager extends Mob {
    public static MOB_ID = 'minecraft:zombie_villager_v2';

    public override getType(): string {
        return ZombieVillager.MOB_ID;
    }

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
