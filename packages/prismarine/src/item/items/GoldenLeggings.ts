import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class GoldenLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_leggings',
            id: ItemIdsType.GoldenLeggings
        });
    }

    public getMaxDurability() {
        return 105;
    }

    public getArmorDefensePoints() {
        return 4;
    }
}
