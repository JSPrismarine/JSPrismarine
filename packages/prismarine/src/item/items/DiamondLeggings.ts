import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class DiamondLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:diamond_leggings',
            id: ItemIdsType.DiamondLeggings
        });
    }

    public getMaxDurability() {
        return 495;
    }

    public getArmorDefensePoints() {
        return 6;
    }

    public getArmorToughness() {
        return 2;
    }
}
