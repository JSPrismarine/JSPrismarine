import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class NetheriteChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:netherite_chestplate',
            id: ItemIdsType.NetheriteChestplate
        });
    }

    public getMaxDurability() {
        return 592;
    }

    public getArmorDefensePoints() {
        return 8;
    }

    public getArmorToughness() {
        return 3;
    }
}
