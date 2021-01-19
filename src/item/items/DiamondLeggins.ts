import Armor from '../Armor';
import { ItemIdsType } from '../ItemIdsType';

export default class DiamondLeggins extends Armor {
    public constructor() {
        super({
            name: 'minecraft:diamond_Leggins',
            id: ItemIdsType.DiamondLeggins
        });
    }

    public getMaxDurability() {
        return 495;
    }

    public getArmorDefensePoints() {
        return 6;
    }

    public getArmorToughness() {
        return 2;
    }
}
