import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class NetheriteBoots extends Armor {
    constructor() {
        super({
            name: 'minecraft:netherite_boots',
            id: ItemIdsType.NetheriteBoots
        });
    }

    getMaxDurability() {
        return 481;
    }

    getArmorDefensePoints() {
        return 3;
    }

    getArmorToughness() {
        return 3;
    }
}
