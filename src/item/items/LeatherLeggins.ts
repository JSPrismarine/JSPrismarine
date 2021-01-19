import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class LeatherLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:leather_leggins',
            id: ItemIdsType.LeatherPants
        });
    }

    public getMaxDurability() {
        return 75;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
