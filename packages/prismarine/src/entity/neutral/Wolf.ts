import { Mob } from '../Mob';
import { neutralBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Wolf extends Mob {
    public static MOB_ID = 'minecraft:wolf';

    /**
     * A wild wolf minds its own business until somebody hits it.
     *
     * Not the guardian brain, which is what a *tamed* one gets in vanilla - and taming is not
     * modelled here, so the honest behaviour is the untamed one.
     */
    protected override createGoals(): GoalSelector {
        return neutralBrain();
    }
}
