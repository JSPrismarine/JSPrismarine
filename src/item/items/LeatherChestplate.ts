import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

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
