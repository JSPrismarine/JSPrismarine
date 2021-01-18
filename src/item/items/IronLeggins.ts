import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class IronLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:iron_leggins',
            id: ItemIdsType.IronLeggins
        });
    }

    public getMaxDurability() {
        return 225;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
