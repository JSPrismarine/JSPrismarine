import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class NetheriteHelmet extends Armor {
    public constructor() {
        super({
            name: 'minecraft:netherite_helmet',
            id: ItemIdsType.NetheriteHelmet
        });
    }

    public getMaxDurability() {
        return 407;
    }

    public getArmorDefensePoints() {
        return 3;
    }

    public getArmorToughness() {
        return 3;
    }
}
