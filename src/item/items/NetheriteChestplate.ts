import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class NetheriteChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:netherite_chestplate',
            id: ItemIdsType.NetheriteChestplate
        });
    }

    getMaxDurability() {
        return 592;
    }

    getArmorDefensePoints() {
        return 8;
    }

    getArmorToughness() {
        return 3;
    }
}
