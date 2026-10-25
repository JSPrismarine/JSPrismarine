import { Mob } from '../Mob';
import type { MobLootState } from '../mobLoot';
import { hostileBrain } from '../ai/Brains';
import type GoalSelector from '../ai/GoalSelector';

export default class Slime extends Mob {
    public static MOB_ID = 'minecraft:slime';

    protected override createGoals(): GoalSelector {
        return hostileBrain();
    }

    /**
     * Its size, which Java's table reads: only the smallest of the three drops slime balls.
     *
     * This server neither splits a slime nor gives it a size, so every slime is the smallest
     * one - which is the same answer the hand-written table gave, and the only one that leaves
     * anything behind. It goes when the entity component runtime carries a cube's size.
     * @returns {MobLootState} The size the slime ball pool branches on.
     */
    protected override lootState(): MobLootState {
        return { ...super.lootState(), typeSpecific: { size: 1 } };
    }
}
