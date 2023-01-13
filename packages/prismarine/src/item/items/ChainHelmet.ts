import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class ChainHelmet extends Armor {
    public constructor() {
        super({
            name: 'minecraft:chainmail_helmet',
            id: ItemIdsType.ChainHelmet
        });
    }

    public getMaxDurability() {
        return 165;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
