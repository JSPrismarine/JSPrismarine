import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class IronLeggins extends Armor {
    constructor() {
        super({
            name: "minecraft:iron_leggins",
            id: ItemIdsType.IronLeggins,
        });
    }

    getMaxDurability() {
        return 225;
    }

    getArmorDefensePoints() {
        return 5;
    }
}
