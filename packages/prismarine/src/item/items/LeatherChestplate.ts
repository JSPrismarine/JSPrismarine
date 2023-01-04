import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class LeatherChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:leather_chestplate',
            id: ItemIdsType.LeatherTunic
        });
    }

    public getMaxDurability() {
        return 80;
    }

    public getArmorDefensePoints() {
        return 3;
    }
}
