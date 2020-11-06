import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class IronBoots extends Armor {
    constructor() {
        super({
            name: 'minecraft:iron_boots',
            id: ItemIdsType.IronBoots
        });
    }
    getMaxDurability() {
        return 195;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
