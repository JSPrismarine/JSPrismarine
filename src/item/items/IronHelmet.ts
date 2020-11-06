import Armor from '../Armor';
import {ItemIdsType} from '../ItemIdsType';

export default class IronHelmet extends Armor {
    constructor() {
        super({
            name: 'minecraft:iron_helmet',
            id: ItemIdsType.IronHelmet
        });
    }

    getMaxDurability() {
        return 165;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
