import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class DiamondHelmet extends Armor {
    constructor() {
        super({
            name: 'minecraft:diamond_helmet',
            id: ItemIdsType.DiamondHelmet
        });
    }

    getMaxDurability() {
        return 363;
    }

    getArmorDefensePoints() {
        return 3;
    }

    getArmorToughness() {
        return 2;
    }
}
