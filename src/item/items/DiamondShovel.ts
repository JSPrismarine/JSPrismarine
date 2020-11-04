import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class Shovel extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:diamond_shovel",
                id: ItemIdsType.DiamondShovel,
            },
            ItemTieredToolType.Diamond
        );
    }

    getMaxDurability() {
        return 1562;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
