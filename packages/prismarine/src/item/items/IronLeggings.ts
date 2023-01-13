import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class IronLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:iron_leggings',
            id: ItemIdsType.IronLeggings
        });
    }

    public getMaxDurability() {
        return 225;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
