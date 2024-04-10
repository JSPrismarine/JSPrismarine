import { Armor } from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class IronLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:iron_leggings',
            id: ItemIdsType.IronLeggings
        });
    }

    public getMaxDurability() {
        return 225;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
