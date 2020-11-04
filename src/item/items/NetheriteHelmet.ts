import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Helmet extends Armor {
    constructor() {
        super({
            name: "minecraft:netherite_helmet",
            id: ItemIdsType.NetheriteHelmet,
        });
    }

    getMaxDurability() {
        return 407;
    }

    getArmorDefensePoints() {
        return 3;
    }

    getArmorToughness() {
        return 3;
    }
}
