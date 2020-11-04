import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Helmet extends Armor {
    constructor() {
        super({
            name: "minecraft:turtle_helmet",
            id: ItemIdsType.TurtleHelmet,
        });
    }

    getMaxDurability() {
        return 275;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
