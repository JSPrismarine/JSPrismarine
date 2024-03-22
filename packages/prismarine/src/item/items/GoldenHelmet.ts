import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class GoldenHelmet extends Armor {
    public constructor() {
        super({
            name: 'minecraft:golden_helmet',
            id: ItemIdsType.GoldenHelmet
        });
    }

    public getMaxDurability() {
        return 77;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
