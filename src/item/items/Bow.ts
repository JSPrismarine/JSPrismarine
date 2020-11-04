import Tool from "../Tool";
import { ItemIdsType } from "../ItemIdsType";

export default class Bow extends Tool {
    constructor() {
        super({
            name: "minecraft:bow",
            id: ItemIdsType.Bow,
        });
    }

    getBurntime() {
        return 300;
    }

    getMaxDurability() {
        return 384;
    }
}
