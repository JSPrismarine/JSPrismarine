import { Armor } from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class IronHelmet extends Armor {
    public constructor() {
        super({
            name: 'minecraft:iron_helmet',
            id: ItemIdsType.IronHelmet
        });
    }

    public getMaxDurability() {
        return 165;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
