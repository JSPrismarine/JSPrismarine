import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class LeatherBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:leather_boots',
            id: ItemIdsType.LeatherBoots
        });
    }

    public getMaxDurability() {
        return 65;
    }

    public getArmorDefensePoints() {
        return 1;
    }
}
