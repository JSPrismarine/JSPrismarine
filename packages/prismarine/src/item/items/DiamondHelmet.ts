import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class DiamondHelmet extends Armor {
    public constructor() {
        super({
            name: 'minecraft:diamond_helmet',
            id: ItemIdsType.DiamondHelmet
        });
    }

    public getMaxDurability() {
        return 363;
    }

    public getArmorDefensePoints() {
        return 3;
    }

    public getArmorToughness() {
        return 2;
    }
}
