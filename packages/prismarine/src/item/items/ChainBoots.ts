import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class ChainBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:chainmail_boots',
            id: ItemIdsType.ChainBoots
        });
    }

    public getMaxDurability() {
        return 195;
    }

    public getArmorDefensePoints() {
        return 1;
    }
}
