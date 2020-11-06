import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class ChainLeggins extends Armor {
    constructor() {
        super({
            name: 'minecraft:chainmail_leggins',
            id: ItemIdsType.ChainLeggins
        });
    }

    getMaxDurability() {
        return 225;
    }

    getArmorDefensePoints() {
        return 5;
    }
}
