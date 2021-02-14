import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class ChainLeggings extends Armor {
    public constructor() {
        super({
            name: 'minecraft:chainmail_leggings',
            id: ItemIdsType.ChainLeggings
        });
    }

    public getMaxDurability() {
        return 225;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
