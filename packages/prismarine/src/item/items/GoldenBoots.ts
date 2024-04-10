import { Armor } from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class GoldenBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_boots',
            id: ItemIdsType.GoldenBoots
        });
    }

    public getMaxDurability() {
        return 91;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
