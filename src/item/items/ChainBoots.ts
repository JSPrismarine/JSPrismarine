import Armor from '../Armor';
import {ItemIdsType} from '../ItemIdsType';

export default class ChainBoots extends Armor {
    constructor() {
        super({
            name: 'minecraft:chainmail_boots',
            id: ItemIdsType.ChainBoots
        });
    }

    getMaxDurability() {
        return 195;
    }

    getArmorDefensePoints() {
        return 1;
    }
}
