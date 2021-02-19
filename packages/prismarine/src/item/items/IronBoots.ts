import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class IronBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:iron_boots',
            id: ItemIdsType.IronBoots
        });
    }

    public getMaxDurability() {
        return 195;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
