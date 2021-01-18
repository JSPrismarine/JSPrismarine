import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class NetheriteLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:netherite_leggins',
            id: ItemIdsType.NetheriteLeggins
        });
    }

    public getMaxDurability() {
        return 555;
    }

    public getArmorDefensePoints() {
        return 6;
    }

    public getArmorToughness() {
        return 3;
    }
}
