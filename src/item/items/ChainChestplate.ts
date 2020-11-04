import Armor from "../Armor";
import { ItemIdsType } from "../ItemIdsType";

export default class Chestplate extends Armor {
    constructor() {
        super({
            name: "minecraft:chainmail_chestplate",
            id: ItemIdsType.ChainChestplate,
        });
    }

    getMaxDurability() {
        return 240;
    }

    getArmorDefensePoints() {
        return 5;
    }
}
