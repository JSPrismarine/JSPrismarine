import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Leggins extends Armor {
    constructor() {
        super({
            name: "minecraft:diamond_Leggins",
            id: ItemIdsType.DiamondLeggins,
        });
    }

    getMaxDurability() {
        return 495;
    }

    getArmorDefensePoints() {
        return 6;
    }

    getArmorToughness() {
        return 2;
    }
}
