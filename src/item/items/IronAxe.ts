import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class Axe extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:iron_axe",
                id: ItemIdsType.IronAxe,
            },
            ItemTieredToolType.Iron
        );
    }

    getMaxDurability() {
        return 251;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
