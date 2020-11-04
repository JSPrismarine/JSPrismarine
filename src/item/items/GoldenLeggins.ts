import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class GoldenLeggins extends Armor {
    constructor() {
        super({
            name: "minecraft:golden_leggins",
            id: ItemIdsType.GoldenLeggins,
        });
    }

    getMaxDurability() {
        return 105;
    }

    getArmorDefensePoints() {
        return 4;
    }
}
