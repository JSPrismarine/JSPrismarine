import { Mob } from '../Mob';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class ZombieVillager extends Mob {
    public static MOB_ID = 'minecraft:zombie_villager_v2';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }
}
