import Solid from "../Solid";
import { ItemTieredToolType } from "../../item/ItemTieredToolType";
import { BlockIdsType } from "../BlockIdsType";
import { BlockToolType } from "../BlockToolType";

export default class LapisOre extends Solid {
    constructor() {
        super({
            name: "minecraft:lapis_ore",
            id: BlockIdsType.LapisOre,
            hardness: 3,
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Stone;
    }
}
