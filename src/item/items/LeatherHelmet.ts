import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Helmet extends Armor {
    constructor() {
        super({
            name: "minecraft:leather_helmet",
            id: ItemIdsType.LeatherCap,
        });
    }

    getMaxDurability() {
        return 55;
    }

    getArmorDefensePoints() {
        return 1;
    }
}
