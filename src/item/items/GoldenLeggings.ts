import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class GoldenLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_leggings',
            id: ItemIdsType.GoldenLeggings
        });
    }

    public getMaxDurability() {
        return 105;
    }

    public getArmorDefensePoints() {
        return 4;
    }
}
