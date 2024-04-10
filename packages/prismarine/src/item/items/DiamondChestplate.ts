import { Armor } from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class DiamondChestplate extends Armor {
    public constructor() {
        super({
            name: 'minecraft:diamond_chestplate',
            id: ItemIdsType.DiamondChestplate
        });
    }

    public getMaxDurability() {
        return 528;
    }

    public getArmorDefensePoints() {
        return 8;
    }

    public getArmorToughness() {
        return 2;
    }
}
