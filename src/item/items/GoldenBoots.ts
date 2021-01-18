import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class GoldenBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_boots',
            id: ItemIdsType.GoldenBoots
        });
    }

    getMaxDurability() {
        return 91;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
