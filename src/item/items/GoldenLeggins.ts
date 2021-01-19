import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class GoldenLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_leggins',
            id: ItemIdsType.GoldenLeggins
        });
    }

    public getMaxDurability() {
        return 105;
    }

    public getArmorDefensePoints() {
        return 4;
    }
}
