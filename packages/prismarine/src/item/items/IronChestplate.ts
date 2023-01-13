import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class IronChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:iron_chestplate',
            id: ItemIdsType.IronChestplate
        });
    }

    public getMaxDurability() {
        return 240;
    }

    public getArmorDefensePoints() {
        return 6;
    }
}
