import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class LeatherLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:leather_leggins',
            id: ItemIdsType.LeatherPants
        });
    }

    getMaxDurability() {
        return 75;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
