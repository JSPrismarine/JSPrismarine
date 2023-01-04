import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class GoldenChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_chestplate',
            id: ItemIdsType.GoldenChestplate
        });
    }

    public getMaxDurability() {
        return 112;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
