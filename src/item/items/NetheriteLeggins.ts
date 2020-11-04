import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Leggins extends Armor {
    constructor() {
        super({
            name: "minecraft:netherite_leggins",
            id: ItemIdsType.NetheriteLeggins,
        });
    }

    getMaxDurability() {
        return 555;
    }

    getArmorDefensePoints() {
        return 6;
    }

    getArmorToughness() {
        return 3;
    }
}
