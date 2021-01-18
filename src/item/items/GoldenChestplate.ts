import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class GoldenChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_chestplate',
            id: ItemIdsType.GoldenChestplate
        });
    }

    getMaxDurability() {
        return 112;
    }

    getArmorDefensePoints() {
        return 5;
    }
}
