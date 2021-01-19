import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class ChainChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:chainmail_chestplate',
            id: ItemIdsType.ChainChestplate
        });
    }

    public getMaxDurability() {
        return 240;
    }

    public getArmorDefensePoints() {
        return 5;
    }
}
