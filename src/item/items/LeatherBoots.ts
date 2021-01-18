import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class LeatherBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:leather_boots',
            id: ItemIdsType.LeatherBoots
        });
    }

    getMaxDurability() {
        return 65;
    }

    getArmorDefensePoints() {
        return 1;
    }
}
