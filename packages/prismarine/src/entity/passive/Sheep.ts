import { Mob } from '../Mob';
import type { MobLootState } from '../mobLoot';

export default class Sheep extends Mob {
    public static MOB_ID = 'minecraft:sheep';

    /**
     * Its wool, which Java's table picks by the sheep's own color component.
     *
     * This server does not model a sheep's color or whether it has been sheared, so every sheep
     * is an unsheared white one - the same answer the hand-written table gave, and the default a
     * sheep is born with. Both go the moment the entity component runtime carries them.
     * @returns {MobLootState} The color and shearing the wool table branches on.
     */
    protected override lootState(): MobLootState {
        return {
            ...super.lootState(),
            components: new Map([['minecraft:sheep/color', 'white']]),
            typeSpecific: { sheared: false }
        };
    }
}
