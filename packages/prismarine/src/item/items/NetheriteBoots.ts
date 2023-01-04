import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class NetheriteBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:netherite_boots',
            id: ItemIdsType.NetheriteBoots
        });
    }

    public getMaxDurability() {
        return 481;
    }

    public getArmorDefensePoints() {
        return 3;
    }

    public getArmorToughness() {
        return 3;
    }
}
