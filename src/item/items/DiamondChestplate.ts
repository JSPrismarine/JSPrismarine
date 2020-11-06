import Armor from '../Armor';
import {ItemIdsType} from '../ItemIdsType';

export default class DiamondChestplate extends Armor {
    constructor() {
        super({
            name: 'minecraft:diamond_chestplate',
            id: ItemIdsType.DiamondChestplate
        });
    }

    getMaxDurability() {
        return 528;
    }

    getArmorDefensePoints() {
        return 8;
    }

    getArmorToughness() {
        return 2;
    }
}
