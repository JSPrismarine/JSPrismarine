import Armor from '../Armor';
import {ItemIdsType} from '../ItemIdsType';

export default class ChainHelmet extends Armor {
    constructor() {
        super({
            name: 'minecraft:chainmail_helmet',
            id: ItemIdsType.ChainHelmet
        });
    }

    getMaxDurability() {
        return 165;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
