import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class DiamondBoots extends Armor {
    public constructor() {
        super({
            name: 'minecraft:diamond_boots',
            id: ItemIdsType.DiamondBoots
        });
    }

    public getMaxDurability() {
        return 429;
    }

    public getArmorDefensePoints() {
        return 3;
    }

    public getArmorToughness() {
        return 2;
    }
}
