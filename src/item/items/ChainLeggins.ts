import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class ChainLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:chainmail_leggins',
            id: ItemIdsType.ChainLeggins
        });
    }

    public getMaxDurability() {
        return 225;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
