import { Armor } from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class LeatherBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:leather_boots',
            id: ItemIdsType.LeatherBoots
        });
    }

    public getMaxDurability() {
        return 65;
    }

    public getArmorDefensePoints() {
        return 1;
    }
}
