import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class IronChestplate extends Armor {
    constructor() {
        super({
            name: "minecraft:iron_chestplate",
            id: ItemIdsType.IronChestplate,
        });
    }

    getMaxDurability() {
        return 240;
    }

    getArmorDefensePoints() {
        return 6;
    }
}
