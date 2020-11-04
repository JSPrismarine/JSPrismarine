import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Helmet extends Armor {
    constructor() {
        super({
            name: "minecraft:golden_helmet",
            id: ItemIdsType.GoldenHelmet,
        });
    }

    getMaxDurability() {
        return 77;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
