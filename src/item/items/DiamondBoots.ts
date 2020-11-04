import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Boots extends Armor {
    constructor() {
        super({
            name: "minecraft:diamond_boots",
            id: ItemIdsType.DiamondBoots,
        });
    }

    getMaxDurability() {
        return 429;
    }

    getArmorDefensePoints() {
        return 3;
    }

    getArmorToughness() {
        return 2;
    }
}
