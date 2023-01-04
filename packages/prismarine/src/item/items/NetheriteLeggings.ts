import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class NetheriteLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:netherite_leggings',
            id: ItemIdsType.NetheriteLeggings
        });
    }

    public getMaxDurability() {
        return 555;
    }

    public getArmorDefensePoints() {
        return 6;
    }

    public getArmorToughness() {
        return 3;
    }
}
